import { logger } from '../config/logger';
import { WhatsAppAccount, IWhatsAppAccount } from '../models/WhatsAppAccount';
import { Contact } from '../models/Contact';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { decrypt } from './encryption.service';
import { ApiError } from '../utils/apiError';

const META_GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * Get decrypted access token for a WhatsApp account.
 */
async function getDecryptedToken(waAccount: IWhatsAppAccount): Promise<string> {
  return decrypt(waAccount.accessToken);
}

/**
 * Send a text message via Meta Graph API.
 */
export async function sendTextMessage(
  waAccountId: string,
  to: string,
  text: string,
  botSent = false
): Promise<{ waMessageId: string }> {
  const waAccount = await WhatsAppAccount.findById(waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = await getDecryptedToken(waAccount);

  // Check 24-hour session window
  const contact = await Contact.findOne({ waAccountId, waId: to });
  if (contact?.lastMessageAt) {
    const hoursSinceLastMessage =
      (Date.now() - new Date(contact.lastMessageAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastMessage > 24) {
      throw ApiError.badRequest(
        'Cannot send free-form message: 24-hour session window has expired. ' +
        'Please use a pre-approved template message to re-initiate the conversation.'
      );
    }
  }

  const response = await fetch(`${META_GRAPH_API}/${waAccount.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    logger.error('Meta API error (text):', data);
    handleMetaApiError(data);
  }

  const waMessageId = data.messages?.[0]?.id;

  // Find or create conversation and save message
  const conversation = await findOrCreateConversation(waAccountId, to);
  await Message.create({
    conversationId: conversation._id,
    waMessageId,
    direction: 'outbound',
    type: 'text',
    content: { text },
    status: 'sent',
    sentByBot: botSent,
  });

  // Update conversation
  conversation.lastMessagePreview = text.substring(0, 200);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return { waMessageId };
}

/**
 * Send a template message via Meta Graph API.
 */
export async function sendTemplateMessage(
  waAccountId: string,
  to: string,
  templateName: string,
  language: string = 'en_US',
  components: any[] = [],
  botSent = false
): Promise<{ waMessageId: string }> {
  const waAccount = await WhatsAppAccount.findById(waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = await getDecryptedToken(waAccount);

  const response = await fetch(`${META_GRAPH_API}/${waAccount.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    logger.error('Meta API error (template):', data);
    handleMetaApiError(data);
  }

  const waMessageId = data.messages?.[0]?.id;

  const conversation = await findOrCreateConversation(waAccountId, to);
  await Message.create({
    conversationId: conversation._id,
    waMessageId,
    direction: 'outbound',
    type: 'template',
    content: { templateName, templateParams: components },
    status: 'sent',
    sentByBot: botSent,
  });

  conversation.lastMessagePreview = `[Template: ${templateName}]`;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return { waMessageId };
}

/**
 * Send an interactive button reply message via Meta Graph API.
 * Used by chatbot builder for button nodes.
 */
export async function sendInteractiveButtons(
  waAccountId: string,
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  botSent = true
): Promise<{ waMessageId: string }> {
  const waAccount = await WhatsAppAccount.findById(waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = await getDecryptedToken(waAccount);

  const response = await fetch(`${META_GRAPH_API}/${waAccount.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((btn) => ({
            type: 'reply',
            reply: { id: btn.id, title: btn.title.substring(0, 20) },
          })),
        },
      },
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    logger.error('Meta API error (interactive):', data);
    handleMetaApiError(data);
  }

  const waMessageId = data.messages?.[0]?.id;

  const conversation = await findOrCreateConversation(waAccountId, to);
  await Message.create({
    conversationId: conversation._id,
    waMessageId,
    direction: 'outbound',
    type: 'interactive',
    content: {
      text: bodyText,
      interactive: { buttons },
    },
    status: 'sent',
    sentByBot: botSent,
  });

  conversation.lastMessagePreview = bodyText.substring(0, 200);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return { waMessageId };
}

/**
 * Send media message (image/document/audio/video).
 */
export async function sendMediaMessage(
  waAccountId: string,
  to: string,
  mediaType: 'image' | 'document' | 'audio' | 'video',
  mediaUrl: string,
  caption?: string,
  botSent = false
): Promise<{ waMessageId: string }> {
  const waAccount = await WhatsAppAccount.findById(waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = await getDecryptedToken(waAccount);

  const mediaPayload: any = { link: mediaUrl };
  if (caption && (mediaType === 'image' || mediaType === 'video')) {
    mediaPayload.caption = caption;
  }

  const response = await fetch(`${META_GRAPH_API}/${waAccount.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaPayload,
    }),
  });

  const data: any = await response.json();

  if (!response.ok) {
    logger.error(`Meta API error (${mediaType}):`, data);
    handleMetaApiError(data);
  }

  const waMessageId = data.messages?.[0]?.id;

  const conversation = await findOrCreateConversation(waAccountId, to);
  await Message.create({
    conversationId: conversation._id,
    waMessageId,
    direction: 'outbound',
    type: mediaType,
    content: { mediaUrl, caption, mimeType: '' },
    status: 'sent',
    sentByBot: botSent,
  });

  conversation.lastMessagePreview = caption || `[${mediaType}]`;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  return { waMessageId };
}

/**
 * Verify WABA credentials by pinging Meta Graph API.
 */
export async function verifyConnection(waAccountId: string): Promise<{
  connected: boolean;
  phoneNumber?: string;
  displayName?: string;
}> {
  const waAccount = await WhatsAppAccount.findById(waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = await getDecryptedToken(waAccount);

  try {
    const response = await fetch(
      `${META_GRAPH_API}/${waAccount.phoneNumberId}?fields=display_phone_number,verified_name`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const data: any = await response.json();

    if (!response.ok) {
      logger.warn('WABA verification failed:', data);
      await WhatsAppAccount.findByIdAndUpdate(waAccountId, { status: 'disconnected' });
      return { connected: false };
    }

    await WhatsAppAccount.findByIdAndUpdate(waAccountId, {
      status: 'connected',
      businessDisplayName: data.verified_name || waAccount.businessDisplayName,
    });

    return {
      connected: true,
      phoneNumber: data.display_phone_number,
      displayName: data.verified_name,
    };
  } catch (error) {
    logger.error('WABA verification error:', error);
    return { connected: false };
  }
}

// =================================================================
// Helpers
// =================================================================

/**
 * Find or create a Contact + Conversation for an incoming/outgoing message.
 */
async function findOrCreateConversation(waAccountId: string, waId: string) {
  // Upsert contact
  let contact = await Contact.findOne({ waAccountId, waId });
  if (!contact) {
    contact = await Contact.create({
      waAccountId,
      waId,
      name: waId, // Will be updated when we get profile name from webhook
      source: 'chat',
    });
  }

  // Upsert conversation
  let conversation = await Conversation.findOne({
    contactId: contact._id,
    waAccountId,
  });
  if (!conversation) {
    conversation = await Conversation.create({
      contactId: contact._id,
      waAccountId,
      status: 'open',
    });
  }

  return conversation;
}

/**
 * Handle Meta Graph API errors with friendly messages.
 */
function handleMetaApiError(data: any): never {
  const error = data.error;
  if (!error) throw ApiError.internal('Unknown Meta API error');

  const code = error.code;

  switch (code) {
    case 190: // Invalid or expired token
      throw ApiError.unauthorized('WhatsApp access token is invalid or expired. Please reconnect in Settings.');
    case 131047: // Re-engagement message — 24hr window expired
      throw ApiError.badRequest(
        '24-hour session window expired. Use a template message to re-engage this contact.'
      );
    case 131048: // Spam rate limit
    case 80007: // Rate limit
      throw ApiError.tooManyRequests('WhatsApp rate limit exceeded. Please wait and try again.');
    case 131026: // Message undeliverable
      throw ApiError.badRequest('Message could not be delivered. The recipient may have blocked you or the number is invalid.');
    default:
      throw ApiError.badRequest(`WhatsApp API error: ${error.message || 'Unknown error'} (code: ${code})`);
  }
}

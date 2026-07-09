import { logger } from '../config/logger';
import { WhatsAppAccount } from '../models/WhatsAppAccount';
import { Contact } from '../models/Contact';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { MetaWebhookEntry, MetaInboundMessage, MetaStatusUpdate } from '../types';
import { processChatbotTrigger } from './chatbot.engine';

/**
 * Process incoming webhook events from Meta.
 * Called from webhook controller after signature verification.
 */
export async function processWebhookEvent(
  entries: MetaWebhookEntry[],
  io: any
): Promise<void> {
  for (const entry of entries) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;

      if (!phoneNumberId) continue;

      // Find the WhatsApp account by phone number ID
      const waAccount = await WhatsAppAccount.findOne({ phoneNumberId });
      if (!waAccount) {
        logger.warn(`Webhook received for unknown phoneNumberId: ${phoneNumberId}`);
        continue;
      }

      // Process incoming messages
      if (value.messages && value.messages.length > 0) {
        for (const msg of value.messages) {
          const contactName = value.contacts?.[0]?.profile?.name || msg.from;
          await handleIncomingMessage(waAccount._id.toString(), msg, contactName, io);
        }
      }

      // Process status updates
      if (value.statuses && value.statuses.length > 0) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status, io);
        }
      }
    }
  }
}

/**
 * Handle a single incoming WhatsApp message.
 */
async function handleIncomingMessage(
  waAccountId: string,
  msg: MetaInboundMessage,
  contactName: string,
  io: any
): Promise<void> {
  try {
    // 1. Upsert contact
    let contact = await Contact.findOneAndUpdate(
      { waAccountId, waId: msg.from },
      {
        $set: {
          name: contactName,
          lastMessageAt: new Date(),
        },
        $setOnInsert: {
          waAccountId,
          waId: msg.from,
          source: 'chat',
          optInStatus: true,
        },
      },
      { upsert: true, new: true }
    );

    // 2. Upsert conversation
    let conversation = await Conversation.findOne({
      contactId: contact._id,
      waAccountId,
    });

    const isFirstMessage = !conversation;

    if (!conversation) {
      conversation = await Conversation.create({
        contactId: contact._id,
        waAccountId,
        status: 'open',
      });
    }

    // 3. Parse message content
    const { type, content, preview } = parseInboundMessage(msg);

    // 4. Create message record
    const message = await Message.create({
      conversationId: conversation._id,
      waMessageId: msg.id,
      direction: 'inbound',
      type,
      content,
      status: 'delivered',
      sentByBot: false,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
    });

    // 5. Update conversation
    conversation.lastMessagePreview = preview;
    conversation.lastMessageAt = message.timestamp;
    conversation.unreadCount += 1;
    if (conversation.status === 'resolved') {
      conversation.status = 'open';
    }
    await conversation.save();

    // 6. Emit real-time event
    if (io) {
      const populatedMessage = await Message.findById(message._id);
      const populatedConversation = await Conversation.findById(conversation._id)
        .populate('contactId');

      io.to(`account:${waAccountId}`).emit('new-message', {
        conversationId: conversation._id.toString(),
        message: populatedMessage,
        conversation: populatedConversation,
      });
    }

    // 7. Check chatbot triggers (only if bot is not disabled for this conversation)
    if (!conversation.botDisabled) {
      const textContent = content.text || '';
      await processChatbotTrigger(
        waAccountId,
        conversation,
        contact,
        textContent,
        isFirstMessage,
        io
      );
    }

    logger.info(`Inbound message from ${msg.from}: ${preview}`);
  } catch (error) {
    logger.error(`Error processing inbound message from ${msg.from}:`, error);
  }
}

/**
 * Handle message status updates (sent/delivered/read/failed).
 */
async function handleStatusUpdate(
  status: MetaStatusUpdate,
  io: any
): Promise<void> {
  try {
    const message = await Message.findOne({ waMessageId: status.id });
    if (!message) return;

    // Only update if the new status is "higher" than current
    const statusOrder = { sent: 1, delivered: 2, read: 3, failed: 0 };
    const currentOrder = statusOrder[message.status] || 0;
    const newOrder = statusOrder[status.status] || 0;

    if (newOrder <= currentOrder && status.status !== 'failed') return;

    message.status = status.status;
    await message.save();

    // Emit real-time status update
    if (io) {
      const conversation = await Conversation.findById(message.conversationId);
      if (conversation) {
        io.to(`account:${conversation.waAccountId}`).emit('message-status', {
          conversationId: conversation._id.toString(),
          messageId: message._id.toString(),
          waMessageId: status.id,
          status: status.status,
        });
      }
    }

    if (status.status === 'failed' && status.errors) {
      logger.warn(`Message ${status.id} failed:`, status.errors);
    }
  } catch (error) {
    logger.error(`Error processing status update for ${status.id}:`, error);
  }
}

/**
 * Parse an inbound message into our internal format.
 */
function parseInboundMessage(msg: MetaInboundMessage): {
  type: string;
  content: Record<string, any>;
  preview: string;
} {
  switch (msg.type) {
    case 'text':
      return {
        type: 'text',
        content: { text: msg.text?.body || '' },
        preview: (msg.text?.body || '').substring(0, 200),
      };

    case 'image':
      return {
        type: 'image',
        content: {
          mediaUrl: '', // Media URL needs to be fetched from Meta
          mimeType: msg.image?.mime_type,
          caption: msg.image?.caption,
        },
        preview: msg.image?.caption || '[Image]',
      };

    case 'document':
      return {
        type: 'document',
        content: {
          mediaUrl: '',
          mimeType: msg.document?.mime_type,
          filename: msg.document?.filename,
          caption: msg.document?.caption,
        },
        preview: msg.document?.filename || '[Document]',
      };

    case 'audio':
      return {
        type: 'audio',
        content: { mediaUrl: '', mimeType: msg.audio?.mime_type },
        preview: '[Audio]',
      };

    case 'video':
      return {
        type: 'video',
        content: {
          mediaUrl: '',
          mimeType: msg.video?.mime_type,
          caption: msg.video?.caption,
        },
        preview: msg.video?.caption || '[Video]',
      };

    case 'interactive':
      const reply =
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        '';
      return {
        type: 'interactive',
        content: {
          text: reply,
          interactive: msg.interactive,
        },
        preview: reply || '[Interactive]',
      };

    default:
      return {
        type: msg.type || 'text',
        content: { text: `[Unsupported message type: ${msg.type}]` },
        preview: `[${msg.type}]`,
      };
  }
}

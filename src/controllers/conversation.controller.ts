import { Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { AuthRequest } from '../types';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { Contact } from '../models/Contact';
import * as waService from '../services/whatsapp.service';

/**
 * GET /api/conversations
 * List conversations with pagination, sorted by last message.
 */
export const listConversations = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as any);
  const { status } = req.query;

  const filter: any = { waAccountId: req.waAccountId };
  if (status && typeof status === 'string') {
    filter.status = status;
  }

  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .populate('contactId', 'name waId tags optInStatus')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit),
    Conversation.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return ApiResponse.paginated(res, conversations, pagination);
});

/**
 * GET /api/conversations/:id
 * Get single conversation with messages.
 */
export const getConversation = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conversation = await Conversation.findOne({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  }).populate('contactId');

  if (!conversation) throw ApiError.notFound('Conversation not found');

  // Get messages with pagination
  const { page, limit, skip } = parsePagination(req.query as any);

  const [messages, totalMessages] = await Promise.all([
    Message.find({ conversationId: conversation._id })
      .sort({ timestamp: -1 }) // Newest first for pagination, client reverses
      .skip(skip)
      .limit(limit),
    Message.countDocuments({ conversationId: conversation._id }),
  ]);

  // Mark as read (reset unread count)
  if (conversation.unreadCount > 0) {
    conversation.unreadCount = 0;
    await conversation.save();
  }

  const pagination = buildPaginationMeta(totalMessages, page, limit);

  return ApiResponse.success(res, {
    conversation,
    messages: messages.reverse(), // Return in chronological order
    pagination,
  });
});

/**
 * POST /api/conversations/:id/messages
 * Send a message in a conversation.
 */
export const sendMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conversation = await Conversation.findOne({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  }).populate('contactId');

  if (!conversation) throw ApiError.notFound('Conversation not found');

  const contact = await Contact.findById(conversation.contactId);
  if (!contact) throw ApiError.notFound('Contact not found');

  // Check opt-in status
  if (!contact.optInStatus) {
    throw ApiError.badRequest('Cannot message this contact — they have opted out.');
  }

  const { type, text, templateName, templateLanguage, templateComponents, mediaUrl, caption } = req.body;

  let result: { waMessageId: string };

  switch (type) {
    case 'text':
      if (!text) throw ApiError.badRequest('Text content is required');
      result = await waService.sendTextMessage(req.waAccountId!, contact.waId, text);
      break;

    case 'template':
      if (!templateName) throw ApiError.badRequest('Template name is required');
      result = await waService.sendTemplateMessage(
        req.waAccountId!,
        contact.waId,
        templateName,
        templateLanguage,
        templateComponents || []
      );
      break;

    case 'image':
    case 'document':
    case 'audio':
    case 'video':
      if (!mediaUrl) throw ApiError.badRequest('Media URL is required');
      result = await waService.sendMediaMessage(
        req.waAccountId!,
        contact.waId,
        type,
        mediaUrl,
        caption
      );
      break;

    default:
      throw ApiError.badRequest(`Unsupported message type: ${type}`);
  }

  // Get the created message
  const message = await Message.findOne({ waMessageId: result.waMessageId });

  // Emit to Socket.IO
  const io = req.app.get('io');
  if (io && message) {
    io.to(`account:${req.waAccountId}`).emit('new-message', {
      conversationId: conversation._id.toString(),
      message,
    });
  }

  return ApiResponse.success(res, { message, waMessageId: result.waMessageId }, 'Message sent');
});

/**
 * PATCH /api/conversations/:id/status
 * Resolve/reopen a conversation.
 */
export const updateStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: req.params.id, waAccountId: req.waAccountId },
    { status: req.body.status },
    { new: true }
  ).populate('contactId');

  if (!conversation) throw ApiError.notFound('Conversation not found');

  // Emit update
  const io = req.app.get('io');
  if (io) {
    io.to(`account:${req.waAccountId}`).emit('conversation-updated', {
      conversationId: conversation._id.toString(),
      conversation,
    });
  }

  return ApiResponse.success(res, conversation, `Conversation ${req.body.status}`);
});

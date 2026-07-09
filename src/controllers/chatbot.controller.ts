import { Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { AuthRequest } from '../types';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { ChatbotFlow } from '../models/ChatbotFlow';

/**
 * GET /api/chatbots
 */
export const listChatbots = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as any);

  const filter = { waAccountId: req.waAccountId };

  const [flows, total] = await Promise.all([
    ChatbotFlow.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    ChatbotFlow.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return ApiResponse.paginated(res, flows, pagination);
});

/**
 * GET /api/chatbots/:id
 */
export const getChatbot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const flow = await ChatbotFlow.findOne({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  });

  if (!flow) throw ApiError.notFound('Chatbot flow not found');

  return ApiResponse.success(res, flow);
});

/**
 * POST /api/chatbots
 */
export const createChatbot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const flow = await ChatbotFlow.create({
    ...req.body,
    waAccountId: req.waAccountId,
  });

  return ApiResponse.created(res, flow);
});

/**
 * PATCH /api/chatbots/:id
 */
export const updateChatbot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const flow = await ChatbotFlow.findOneAndUpdate(
    { _id: req.params.id, waAccountId: req.waAccountId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!flow) throw ApiError.notFound('Chatbot flow not found');

  return ApiResponse.success(res, flow, 'Flow updated');
});

/**
 * DELETE /api/chatbots/:id
 */
export const deleteChatbot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const flow = await ChatbotFlow.findOneAndDelete({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  });

  if (!flow) throw ApiError.notFound('Chatbot flow not found');

  return ApiResponse.noContent(res, 'Chatbot flow deleted');
});

/**
 * PATCH /api/chatbots/:id/toggle
 * Activate/deactivate a flow.
 */
export const toggleChatbot = asyncHandler(async (req: AuthRequest, res: Response) => {
  const flow = await ChatbotFlow.findOne({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  });

  if (!flow) throw ApiError.notFound('Chatbot flow not found');

  // If activating a default/welcome trigger, deactivate other flows of same trigger type
  if (!flow.isActive && (flow.trigger === 'default' || flow.trigger === 'welcome_message')) {
    await ChatbotFlow.updateMany(
      {
        waAccountId: req.waAccountId,
        trigger: flow.trigger,
        _id: { $ne: flow._id },
      },
      { isActive: false }
    );
  }

  flow.isActive = !flow.isActive;
  await flow.save();

  return ApiResponse.success(res, flow, `Flow ${flow.isActive ? 'activated' : 'deactivated'}`);
});

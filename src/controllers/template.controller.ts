import { Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { AuthRequest } from '../types';
import { MessageTemplate } from '../models/MessageTemplate';
import { WhatsAppAccount } from '../models/WhatsAppAccount';
import { decrypt } from '../services/encryption.service';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';

const META_GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * GET /api/templates
 * List templates, optionally syncing from Meta.
 */
export const listTemplates = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as any);
  const { sync } = req.query;

  // Sync from Meta if requested
  if (sync === 'true' && req.waAccountId) {
    await syncTemplatesFromMeta(req.waAccountId);
  }

  const filter = { waAccountId: req.waAccountId };
  const [templates, total] = await Promise.all([
    MessageTemplate.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    MessageTemplate.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return ApiResponse.paginated(res, templates, pagination);
});

/**
 * POST /api/templates
 * Create a template and submit to Meta for approval.
 */
export const createTemplate = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, category, language, components } = req.body;

  if (!name || !category || !components) {
    throw ApiError.badRequest('name, category, and components are required');
  }

  // Submit to Meta
  const waAccount = await WhatsAppAccount.findById(req.waAccountId);
  if (!waAccount) throw ApiError.notFound('WhatsApp account not found');

  const accessToken = decrypt(waAccount.accessToken);

  const response = await fetch(
    `${META_GRAPH_API}/${waAccount.wabaId}/message_templates`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        category,
        language: language || 'en_US',
        components,
      }),
    }
  );

  const data: any = await response.json();

  if (!response.ok) {
    throw ApiError.badRequest(`Meta API error: ${data.error?.message || 'Unknown error'}`);
  }

  const template = await MessageTemplate.create({
    waAccountId: req.waAccountId,
    name,
    category,
    language: language || 'en_US',
    status: 'PENDING',
    components,
    metaTemplateId: data.id,
  });

  return ApiResponse.created(res, template, 'Template submitted for approval');
});

/**
 * Sync templates from Meta Graph API.
 */
async function syncTemplatesFromMeta(waAccountId: string): Promise<void> {
  try {
    const waAccount = await WhatsAppAccount.findById(waAccountId);
    if (!waAccount) return;

    const accessToken = decrypt(waAccount.accessToken);
    const response = await fetch(
      `${META_GRAPH_API}/${waAccount.wabaId}/message_templates?limit=100`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) return;

    const data: any = await response.json();
    const templates = data.data || [];

    for (const t of templates) {
      await MessageTemplate.findOneAndUpdate(
        { waAccountId, name: t.name },
        {
          waAccountId,
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          components: t.components || [],
          metaTemplateId: t.id,
        },
        { upsert: true }
      );
    }
  } catch (error) {
    // Non-critical — log and continue
  }
}

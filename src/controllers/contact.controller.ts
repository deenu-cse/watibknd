import { Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { AuthRequest } from '../types';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { Contact } from '../models/Contact';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import Papa from 'papaparse';

/**
 * GET /api/contacts
 * List contacts with search, filter by tag, pagination.
 */
export const listContacts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = parsePagination(req.query as any);
  const { search, tag, source } = req.query;

  const filter: any = { waAccountId: req.waAccountId };

  // Search by name or waId
  if (search && typeof search === 'string') {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { waId: { $regex: search, $options: 'i' } },
    ];
  }

  // Filter by tag
  if (tag && typeof tag === 'string') {
    filter.tags = tag;
  }

  // Filter by source
  if (source && typeof source === 'string') {
    filter.source = source;
  }

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Contact.countDocuments(filter),
  ]);

  const pagination = buildPaginationMeta(total, page, limit);
  return ApiResponse.paginated(res, contacts, pagination);
});

/**
 * GET /api/contacts/:id
 * Get single contact with conversation history.
 */
export const getContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contact = await Contact.findOne({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  });

  if (!contact) throw ApiError.notFound('Contact not found');

  // Get conversation for this contact
  const conversation = await Conversation.findOne({
    contactId: contact._id,
    waAccountId: req.waAccountId,
  });

  // Get recent messages if conversation exists
  let recentMessages: any[] = [];
  if (conversation) {
    recentMessages = await Message.find({ conversationId: conversation._id })
      .sort({ timestamp: -1 })
      .limit(50);
  }

  return ApiResponse.success(res, {
    contact,
    conversation,
    recentMessages: recentMessages.reverse(),
  });
});

/**
 * POST /api/contacts
 * Create a contact manually.
 */
export const createContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existingContact = await Contact.findOne({
    waAccountId: req.waAccountId,
    waId: req.body.waId,
  });

  if (existingContact) {
    throw ApiError.conflict('Contact with this WhatsApp number already exists');
  }

  const contact = await Contact.create({
    ...req.body,
    waAccountId: req.waAccountId,
  });

  return ApiResponse.created(res, contact);
});

/**
 * PATCH /api/contacts/:id
 * Update contact details.
 */
export const updateContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { customFields, ...updateData } = req.body;

  const updateOps: any = { $set: updateData };

  // Handle customFields as individual key-value updates
  if (customFields && typeof customFields === 'object') {
    for (const [key, value] of Object.entries(customFields)) {
      updateOps.$set[`customFields.${key}`] = value;
    }
  }

  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, waAccountId: req.waAccountId },
    updateOps,
    { new: true, runValidators: true }
  );

  if (!contact) throw ApiError.notFound('Contact not found');

  return ApiResponse.success(res, contact, 'Contact updated');
});

/**
 * DELETE /api/contacts/:id
 */
export const deleteContact = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contact = await Contact.findOneAndDelete({
    _id: req.params.id,
    waAccountId: req.waAccountId,
  });

  if (!contact) throw ApiError.notFound('Contact not found');

  return ApiResponse.noContent(res, 'Contact deleted');
});

/**
 * POST /api/contacts/:id/tags
 * Add tags to a contact.
 */
export const addTags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, waAccountId: req.waAccountId },
    { $addToSet: { tags: { $each: req.body.tags } } },
    { new: true }
  );

  if (!contact) throw ApiError.notFound('Contact not found');

  return ApiResponse.success(res, contact, 'Tags added');
});

/**
 * DELETE /api/contacts/:id/tags
 * Remove tags from a contact.
 */
export const removeTags = asyncHandler(async (req: AuthRequest, res: Response) => {
  const contact = await Contact.findOneAndUpdate(
    { _id: req.params.id, waAccountId: req.waAccountId },
    { $pullAll: { tags: req.body.tags } },
    { new: true }
  );

  if (!contact) throw ApiError.notFound('Contact not found');

  return ApiResponse.success(res, contact, 'Tags removed');
});

/**
 * POST /api/contacts/import
 * Bulk import contacts from CSV.
 */
export const importContacts = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw ApiError.badRequest('CSV file is required');
  }

  const csvText = req.file.buffer.toString('utf-8');
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    throw ApiError.badRequest('CSV parsing errors', {
      csv: parsed.errors.map((e) => e.message),
    });
  }

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (const row of parsed.data as Record<string, string>[]) {
    try {
      const waId = (row.waid || row.phone || row.whatsapp || row.number || '').replace(/\D/g, '');
      if (!waId) {
        results.errors.push(`Row skipped: no phone number found`);
        results.skipped++;
        continue;
      }

      await Contact.findOneAndUpdate(
        { waAccountId: req.waAccountId, waId },
        {
          $set: {
            name: row.name || waId,
            email: row.email || undefined,
            notes: row.notes || undefined,
          },
          $addToSet: {
            tags: { $each: (row.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean) },
          },
          $setOnInsert: {
            waAccountId: req.waAccountId,
            waId,
            source: 'import',
            optInStatus: true,
          },
        },
        { upsert: true }
      );

      results.imported++;
    } catch (error: any) {
      results.errors.push(`Error importing ${row.name || 'unknown'}: ${error.message}`);
      results.skipped++;
    }
  }

  return ApiResponse.success(res, results, `Import complete: ${results.imported} imported, ${results.skipped} skipped`);
});

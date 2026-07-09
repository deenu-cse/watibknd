import { z } from 'zod';

export const createContactSchema = z.object({
  waId: z.string().min(1, 'WhatsApp number is required').regex(/^\d+$/, 'WhatsApp number must contain only digits'),
  name: z.string().max(200).default(''),
  email: z.string().email().optional().or(z.literal('')),
  tags: z.array(z.string()).default([]),
  notes: z.string().max(5000).optional(),
  source: z.enum(['chat', 'import', 'manual', 'chatbot']).default('manual'),
  optInStatus: z.boolean().default(true),
});

export const updateContactSchema = z.object({
  name: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  optInStatus: z.boolean().optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export const tagSchema = z.object({
  tags: z.array(z.string().min(1).max(50)).min(1, 'At least one tag required'),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

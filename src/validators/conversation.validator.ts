import { z } from 'zod';

export const sendMessageSchema = z.object({
  type: z.enum(['text', 'template', 'image', 'document', 'audio', 'video']).default('text'),
  text: z.string().optional(),
  templateName: z.string().optional(),
  templateLanguage: z.string().default('en_US'),
  templateComponents: z.array(z.any()).optional(),
  mediaUrl: z.string().url().optional(),
  caption: z.string().optional(),
});

export const updateConversationSchema = z.object({
  status: z.enum(['open', 'resolved', 'pending']),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

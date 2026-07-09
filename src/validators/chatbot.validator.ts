import { z } from 'zod';

const chatbotNodeDataSchema = z.object({
  text: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['image', 'document', 'audio', 'video']).optional(),
  question: z.string().optional(),
  variableName: z.string().optional(),
  conditions: z.array(z.object({
    operator: z.enum(['equals', 'contains', 'startsWith']),
    value: z.string(),
    nextNodeId: z.string(),
  })).optional(),
  defaultNextNodeId: z.string().optional(),
  bodyText: z.string().optional(),
  buttons: z.array(z.object({
    id: z.string(),
    title: z.string().max(20),
    nextNodeId: z.string(),
  })).max(3).optional(),
  handoffMessage: z.string().optional(),
});

const chatbotNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['message', 'question', 'condition', 'buttons', 'handoff']),
  data: chatbotNodeDataSchema,
  nextNodeId: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

export const createChatbotSchema = z.object({
  name: z.string().min(1, 'Flow name is required').max(200),
  trigger: z.enum(['keyword', 'default', 'welcome_message']).default('keyword'),
  triggerKeywords: z.array(z.string()).default([]),
  nodes: z.array(chatbotNodeSchema).default([]),
  startNodeId: z.string().default(''),
  isActive: z.boolean().default(false),
});

export const updateChatbotSchema = createChatbotSchema.partial();

export type CreateChatbotInput = z.infer<typeof createChatbotSchema>;

import { Request } from 'express';

// ============================================================
// Auth Types
// ============================================================

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'admin' | 'agent';
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
  waAccountId?: string;
}

// ============================================================
// API Response Types
// ============================================================

export interface ApiResponseShape<T = unknown> {
  success: boolean;
  data: T | null;
  message: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> extends ApiResponseShape<T[]> {
  pagination: PaginationMeta;
}

// ============================================================
// WhatsApp Types (Meta Cloud API)
// ============================================================

export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'template' | 'interactive';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type ConversationStatus = 'open' | 'resolved' | 'pending';
export type WAAccountStatus = 'connected' | 'pending' | 'disconnected';

export interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: Array<{
      profile: { name: string };
      wa_id: string;
    }>;
    messages?: MetaInboundMessage[];
    statuses?: MetaStatusUpdate[];
  };
  field: string;
}

export interface MetaInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: MetaMediaInfo;
  document?: MetaMediaInfo;
  audio?: MetaMediaInfo;
  video?: MetaMediaInfo;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface MetaMediaInfo {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface MetaStatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}

// ============================================================
// Chatbot Flow Types
// ============================================================

export type ChatbotNodeType = 'message' | 'question' | 'condition' | 'buttons' | 'handoff';
export type ChatbotTrigger = 'keyword' | 'default' | 'welcome_message';

export interface ChatbotNode {
  id: string;
  type: ChatbotNodeType;
  data: {
    // Message node
    text?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'document' | 'audio' | 'video';

    // Question node
    question?: string;
    variableName?: string; // Store answer in contact's customFields

    // Condition node
    conditions?: Array<{
      operator: 'equals' | 'contains' | 'startsWith';
      value: string;
      nextNodeId: string;
    }>;
    defaultNextNodeId?: string;

    // Buttons node
    bodyText?: string;
    buttons?: Array<{
      id: string;
      title: string;
      nextNodeId: string;
    }>;

    // Handoff node
    handoffMessage?: string;
  };
  nextNodeId?: string; // Default next node (for linear flows)
  position?: { x: number; y: number }; // React Flow position
}

// ============================================================
// Socket.IO Event Types
// ============================================================

export interface SocketEvents {
  'new-message': {
    conversationId: string;
    message: unknown;
  };
  'message-status': {
    conversationId: string;
    messageId: string;
    status: MessageStatus;
  };
  'conversation-updated': {
    conversationId: string;
  };
}

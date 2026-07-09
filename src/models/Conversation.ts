import mongoose, { Schema, Document } from 'mongoose';

export interface IBotState {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, string>;
  startedAt: Date;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  contactId: mongoose.Types.ObjectId;
  waAccountId: mongoose.Types.ObjectId;
  status: 'open' | 'resolved' | 'pending';
  unreadCount: number;
  lastMessagePreview: string;
  lastMessageAt: Date;
  assignedAgent?: mongoose.Types.ObjectId; // Future: team inbox
  botState?: IBotState; // Chatbot engine state tracking
  botDisabled: boolean; // Handoff — disable bot for this conversation
  createdAt: Date;
  updatedAt: Date;
}

const botStateSchema = new Schema<IBotState>(
  {
    flowId: { type: String, required: true },
    currentNodeId: { type: String, required: true },
    variables: { type: Schema.Types.Mixed, default: {} },
    startedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new Schema<IConversation>(
  {
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
      index: true,
    },
    waAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppAccount',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'pending'],
      default: 'open',
      index: true,
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastMessagePreview: {
      type: String,
      default: '',
      maxlength: 200,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    assignedAgent: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    botState: {
      type: botStateSchema,
      default: null,
    },
    botDisabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries: conversations by account sorted by last message
conversationSchema.index({ waAccountId: 1, lastMessageAt: -1 });
// Unique: one conversation per contact per account
conversationSchema.index({ contactId: 1, waAccountId: 1 }, { unique: true });

export const Conversation = mongoose.model<IConversation>(
  'Conversation',
  conversationSchema
);

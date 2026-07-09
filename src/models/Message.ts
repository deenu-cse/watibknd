import mongoose, { Schema, Document } from 'mongoose';
import { MessageDirection, MessageType, MessageStatus } from '../types';

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  waMessageId?: string; // Meta's message ID — for status tracking
  direction: MessageDirection;
  type: MessageType;
  content: {
    text?: string;
    mediaUrl?: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    templateName?: string;
    templateParams?: string[];
    interactive?: Record<string, unknown>;
  };
  status: MessageStatus;
  sentByBot: boolean;
  timestamp: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    waMessageId: {
      type: String,
      index: true,
      sparse: true,
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'document', 'audio', 'video', 'template', 'interactive'],
      default: 'text',
    },
    content: {
      text: String,
      mediaUrl: String,
      mimeType: String,
      filename: String,
      caption: String,
      templateName: String,
      templateParams: [String],
      interactive: Schema.Types.Mixed,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed'],
      default: 'sent',
    },
    sentByBot: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    // No timestamps — we use the explicit 'timestamp' field
    timestamps: false,
  }
);

// Compound index for fetching messages in a conversation sorted by time
messageSchema.index({ conversationId: 1, timestamp: 1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);

import mongoose, { Schema, Document } from 'mongoose';
import { ChatbotNode, ChatbotTrigger } from '../types';

export interface IChatbotFlow extends Document {
  _id: mongoose.Types.ObjectId;
  waAccountId: mongoose.Types.ObjectId;
  name: string;
  trigger: ChatbotTrigger;
  triggerKeywords: string[];
  nodes: ChatbotNode[];
  startNodeId: string; // Entry point of the flow
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatbotNodeSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['message', 'question', 'condition', 'buttons', 'handoff'],
      required: true,
    },
    data: {
      text: String,
      mediaUrl: String,
      mediaType: { type: String, enum: ['image', 'document', 'audio', 'video'] },
      question: String,
      variableName: String,
      conditions: [
        {
          operator: { type: String, enum: ['equals', 'contains', 'startsWith'] },
          value: String,
          nextNodeId: String,
        },
      ],
      defaultNextNodeId: String,
      bodyText: String,
      buttons: [
        {
          id: String,
          title: String,
          nextNodeId: String,
        },
      ],
      handoffMessage: String,
    },
    nextNodeId: String,
    position: {
      x: Number,
      y: Number,
    },
  },
  { _id: false }
);

const chatbotFlowSchema = new Schema<IChatbotFlow>(
  {
    waAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppAccount',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Flow name is required'],
      trim: true,
      maxlength: 200,
    },
    trigger: {
      type: String,
      enum: ['keyword', 'default', 'welcome_message'],
      default: 'keyword',
    },
    triggerKeywords: {
      type: [String],
      default: [],
    },
    nodes: {
      type: [chatbotNodeSchema],
      default: [],
    },
    startNodeId: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding active flows by trigger type
chatbotFlowSchema.index({ waAccountId: 1, isActive: 1, trigger: 1 });

export const ChatbotFlow = mongoose.model<IChatbotFlow>(
  'ChatbotFlow',
  chatbotFlowSchema
);

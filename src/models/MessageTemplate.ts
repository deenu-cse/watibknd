import mongoose, { Schema, Document } from 'mongoose';

export interface IMessageTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  waAccountId: mongoose.Types.ObjectId;
  name: string;
  category: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  components: Record<string, unknown>[]; // Meta template JSON structure
  metaTemplateId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageTemplateSchema = new Schema<IMessageTemplate>(
  {
    waAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppAccount',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION'],
      default: 'UTILITY',
    },
    language: {
      type: String,
      required: true,
      default: 'en_US',
    },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED'],
      default: 'PENDING',
    },
    components: {
      type: Schema.Types.Mixed,
      default: [],
    },
    metaTemplateId: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for finding templates by account
messageTemplateSchema.index({ waAccountId: 1, name: 1 }, { unique: true });

export const MessageTemplate = mongoose.model<IMessageTemplate>(
  'MessageTemplate',
  messageTemplateSchema
);

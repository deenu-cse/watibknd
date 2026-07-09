import mongoose, { Schema, Document } from 'mongoose';

export interface IContact extends Document {
  _id: mongoose.Types.ObjectId;
  waAccountId: mongoose.Types.ObjectId;
  waId: string; // WhatsApp phone number (e.g. "919876543210")
  name: string;
  email?: string;
  tags: string[];
  customFields: Map<string, string>;
  source: 'chat' | 'import' | 'manual' | 'chatbot';
  lastMessageAt?: Date;
  optInStatus: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContact>(
  {
    waAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'WhatsAppAccount',
      required: true,
      index: true,
    },
    waId: {
      type: String,
      required: [true, 'WhatsApp ID is required'],
      trim: true,
    },
    name: {
      type: String,
      default: '',
      trim: true,
      maxlength: 200,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    customFields: {
      type: Map,
      of: String,
      default: new Map(),
    },
    source: {
      type: String,
      enum: ['chat', 'import', 'manual', 'chatbot'],
      default: 'chat',
    },
    lastMessageAt: {
      type: Date,
    },
    optInStatus: {
      type: Boolean,
      default: true, // Default opt-in, can be changed per WhatsApp compliance
    },
    notes: {
      type: String,
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: one contact per waId + waAccountId
contactSchema.index({ waId: 1, waAccountId: 1 }, { unique: true });
// Text index for search
contactSchema.index({ name: 'text', waId: 'text' });

export const Contact = mongoose.model<IContact>('Contact', contactSchema);

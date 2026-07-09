import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppAccount extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string; // Encrypted with AES-256-GCM — never plaintext
  phoneNumber: string;
  businessDisplayName: string;
  webhookVerifyToken: string;
  status: 'connected' | 'pending' | 'disconnected';
  createdAt: Date;
}

const whatsAppAccountSchema = new Schema<IWhatsAppAccount>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    wabaId: {
      type: String,
      required: [true, 'WABA ID is required'],
      trim: true,
    },
    phoneNumberId: {
      type: String,
      required: [true, 'Phone Number ID is required'],
      trim: true,
    },
    accessToken: {
      type: String,
      required: [true, 'Access token is required'],
      // Stored encrypted — never log or return to client
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    businessDisplayName: {
      type: String,
      default: '',
      trim: true,
    },
    webhookVerifyToken: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['connected', 'pending', 'disconnected'],
      default: 'pending',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index: one WA account per user+phoneNumberId
whatsAppAccountSchema.index({ userId: 1, phoneNumberId: 1 }, { unique: true });

export const WhatsAppAccount = mongoose.model<IWhatsAppAccount>(
  'WhatsAppAccount',
  whatsAppAccountSchema
);

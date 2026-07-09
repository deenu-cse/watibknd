import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { WhatsAppAccount } from '../models/WhatsAppAccount';
import { encrypt } from '../services/encryption.service';
import * as waService from '../services/whatsapp.service';
import { ApiError } from '../utils/apiError';

/**
 * POST /api/whatsapp/connect
 * Save WABA credentials (encrypts access token).
 */
export const connectAccount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { wabaId, phoneNumberId, accessToken, phoneNumber, businessDisplayName } = req.body;

  if (!wabaId || !phoneNumberId || !accessToken || !phoneNumber) {
    throw ApiError.badRequest('wabaId, phoneNumberId, accessToken, and phoneNumber are required');
  }

  // Encrypt the access token before storing
  const encryptedToken = encrypt(accessToken);

  const waAccount = await WhatsAppAccount.findOneAndUpdate(
    { userId: req.user!.userId, phoneNumberId },
    {
      userId: req.user!.userId,
      wabaId,
      phoneNumberId,
      accessToken: encryptedToken,
      phoneNumber,
      businessDisplayName: businessDisplayName || '',
      status: 'pending',
    },
    { upsert: true, new: true }
  );

  // Verify the connection
  const verification = await waService.verifyConnection(waAccount._id.toString());

  return ApiResponse.success(res, {
    id: waAccount._id,
    wabaId: waAccount.wabaId,
    phoneNumber: waAccount.phoneNumber,
    businessDisplayName: waAccount.businessDisplayName,
    status: verification.connected ? 'connected' : 'disconnected',
    verifiedName: verification.displayName,
  }, verification.connected ? 'WhatsApp account connected successfully' : 'Connection saved but verification failed — check your credentials');
});

/**
 * GET /api/whatsapp/status
 * Check connection health.
 */
export const getStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.waAccountId) {
    return ApiResponse.success(res, { connected: false, status: 'not_configured' }, 'No WhatsApp account configured');
  }

  const verification = await waService.verifyConnection(req.waAccountId);
  const waAccount = await WhatsAppAccount.findById(req.waAccountId).select('-accessToken');

  return ApiResponse.success(res, {
    ...verification,
    account: waAccount,
  });
});

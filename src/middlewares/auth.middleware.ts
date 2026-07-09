import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthRequest, JwtPayload } from '../types';
import { ApiError } from '../utils/apiError';
import { WhatsAppAccount } from '../models/WhatsAppAccount';

/**
 * Protect middleware — verifies JWT access token from Authorization header.
 * Attaches decoded user to req.user.
 */
export async function protect(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    req.user = decoded;

    // Auto-resolve the user's WhatsApp account ID for tenant scoping
    const waAccount = await WhatsAppAccount.findOne({ userId: decoded.userId }).select('_id');
    if (waAccount) {
      req.waAccountId = waAccount._id.toString();
    }

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized('Access token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(ApiError.unauthorized('Invalid access token'));
    } else {
      next(error);
    }
  }
}

/**
 * Require tenant middleware — ensures user has a connected WhatsApp account.
 * Must be used after protect middleware.
 */
export function requireTenant(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.waAccountId) {
    next(ApiError.badRequest('WhatsApp account not connected. Please connect your account in Settings.'));
    return;
  }
  next();
}

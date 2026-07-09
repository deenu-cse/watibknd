import { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/error.middleware';
import { ApiResponse } from '../utils/apiResponse';
import { AuthRequest } from '../types';
import { env, isProd } from '../config/env';
import * as authService from '../services/auth.service';

// Cookie options for refresh token
// sameSite: 'none' + secure: true required for cross-domain (Vercel → Render)
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd, // <--- True in production (HTTPS required), false locally
  sameSite: isProd ? 'none' as const : 'lax' as const, // <--- 'none' requires secure: true
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/auth', // Only sent to auth endpoints
};

/**
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerUser(req.body);
  return ApiResponse.created(res, result, 'Registration successful. Please check your email to verify your account.');
});

/**
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.loginUser(req.body);

  // Set refresh token in httpOnly cookie (cross-domain safe)
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  return ApiResponse.success(res, {
    accessToken: result.accessToken,
    user: result.user,
  }, 'Login successful');
});

/**
 * POST /api/auth/refresh
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      data: null,
      message: 'Refresh token not found',
    });
  }

  const result = await authService.refreshAccessToken(refreshToken);
  return ApiResponse.success(res, result, 'Token refreshed');
});

/**
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  // Clear refresh token from DB
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    // Decode without verification to get userId for cleanup
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(refreshToken) as { userId: string } | null;
      if (decoded?.userId) {
        await authService.logoutUser(decoded.userId);
      }
    } catch {
      // Ignore decode errors — still clear cookie
    }
  }

  // Clear cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' as const : 'lax' as const,
    path: '/api/auth',
  });

  return ApiResponse.success(res, null, 'Logged out successfully');
});

/**
 * GET /api/auth/verify-email/:token
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.verifyEmail(req.params.token);
  return ApiResponse.success(res, result, 'Email verified successfully');
});

/**
 * POST /api/auth/forgot-password
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body.email);
  return ApiResponse.success(res, result, result.message);
});

/**
 * POST /api/auth/reset-password/:token
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.resetPassword(req.params.token, req.body.password);
  return ApiResponse.success(res, result, result.message);
});

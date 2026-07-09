import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { env, isDev } from '../config/env';
import { logger } from '../config/logger';
import { User, IUser } from '../models/User';
import { ApiError } from '../utils/apiError';
import { JwtPayload } from '../types';
import { RegisterInput, LoginInput } from '../validators/auth.validator';

/**
 * Generate short-lived access JWT (15 minutes).
 */
function generateAccessToken(user: IUser): string {
  const payload: JwtPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '15m' });
}

/**
 * Generate long-lived refresh JWT (7 days).
 */
function generateRefreshToken(user: IUser): string {
  const payload = { userId: user._id.toString() };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

/**
 * Get Nodemailer transporter.
 * In dev mode without SMTP config, logs emails to console.
 */
function getMailTransporter(): nodemailer.Transporter {
  if (!env.SMTP_HOST || isDev) {
    // Dev: use console logging
    return nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

/**
 * Send an email. In dev without SMTP, logs to console.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const transporter = getMailTransporter();

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (isDev && !env.SMTP_HOST) {
    logger.info(`📧 Email (dev mode):\nTo: ${to}\nSubject: ${subject}\n${JSON.parse(info.message).html || html}`);
  } else {
    logger.info(`Email sent to ${to}: ${info.messageId}`);
  }
}

// =================================================================
// Auth Service Methods
// =================================================================

export async function registerUser(input: RegisterInput) {
  // Check if email already exists
  const existingUser = await User.findOne({ email: input.email });
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  // Generate email verification token
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');

  // Create user
  const user = await User.create({
    ...input,
    emailVerificationToken,
  });

  // Send verification email
  const verifyUrl = `${env.FRONTEND_URL}/verify-email?token=${emailVerificationToken}`;
  await sendEmail(
    user.email,
    'Verify your email — WatiSaaS',
    `<h2>Welcome to WatiSaaS!</h2>
     <p>Hi ${user.name},</p>
     <p>Please verify your email by clicking the link below:</p>
     <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#22c55e;color:#fff;border-radius:8px;text-decoration:none;">Verify Email</a>
     <p>Or copy this link: ${verifyUrl}</p>
     <p>This link expires in 24 hours.</p>`
  );

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    businessName: user.businessName,
  };
}

export async function loginUser(input: LoginInput) {
  // Find user with password field included
  const user = await User.findOne({ email: input.email }).select('+password +refreshToken');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Compare password
  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refresh token to DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      businessName: user.businessName,
      isVerified: user.isVerified,
    },
  };
}

export async function refreshAccessToken(oldRefreshToken: string) {
  // Verify the refresh token
  let decoded: { userId: string };
  try {
    decoded = jwt.verify(oldRefreshToken, env.JWT_REFRESH_SECRET) as { userId: string };
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // Find user and verify stored refresh token matches
  const user = await User.findById(decoded.userId).select('+refreshToken');
  if (!user || user.refreshToken !== oldRefreshToken) {
    throw ApiError.unauthorized('Invalid refresh token — please login again');
  }

  // Generate new access token
  const accessToken = generateAccessToken(user);

  return { accessToken };
}

export async function logoutUser(userId: string) {
  await User.findByIdAndUpdate(userId, { refreshToken: undefined });
}

export async function verifyEmail(token: string) {
  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) {
    throw ApiError.badRequest('Invalid or expired verification token');
  }

  user.isVerified = true;
  user.emailVerificationToken = undefined;
  await user.save({ validateBeforeSave: false });

  return { message: 'Email verified successfully' };
}

export async function forgotPassword(email: string) {
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal whether email exists — always return success
    return { message: 'If that email is registered, a reset link has been sent.' };
  }

  // Generate reset token (expires in 1 hour)
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  // Send reset email
  const resetUrl = `${env.FRONTEND_URL}/reset-password/${resetToken}`;
  await sendEmail(
    user.email,
    'Reset your password — WatiSaaS',
    `<h2>Password Reset</h2>
     <p>Hi ${user.name},</p>
     <p>You requested a password reset. Click below to set a new password:</p>
     <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;">Reset Password</a>
     <p>Or copy this link: ${resetUrl}</p>
     <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>`
  );

  return { message: 'If that email is registered, a reset link has been sent.' };
}

export async function resetPassword(token: string, newPassword: string) {
  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset token');
  }

  // Update password (will be hashed by pre-save hook)
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined; // Invalidate all sessions
  await user.save();

  return { message: 'Password reset successful. Please login with your new password.' };
}

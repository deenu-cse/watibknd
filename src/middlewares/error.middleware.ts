import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

/**
 * Centralized error handler — catches all errors from controllers/services.
 * Never leaks stack traces in production.
 */
export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 internal error
  let statusCode = 500;
  let message = 'Internal server error';
  let errors: Record<string, string[]> | undefined;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;

    // Log operational errors at warn level, unexpected errors at error level
    if (err.isOperational) {
      logger.warn(`[${statusCode}] ${message}`);
    } else {
      logger.error(`[${statusCode}] ${message}`, err);
    }
  } else {
    // Unexpected error — log full stack
    logger.error('Unhandled error:', err);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
  }

  // Mongoose duplicate key error
  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate resource';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    ...(errors && { errors }),
    ...((!isProd) && { stack: err.stack }),
  });
}

/**
 * Catch async errors in route handlers.
 * Wraps async controller functions so try/catch isn't needed everywhere.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

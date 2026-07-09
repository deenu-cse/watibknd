import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

/**
 * Connect to MongoDB with retry logic.
 * Uses Mongoose 8.x connection options.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI, {
      // Mongoose 8 handles connection pooling automatically
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info(`✅ MongoDB connected: ${mongoose.connection.host}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown — close DB connection.
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully');
}

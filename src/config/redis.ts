import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * Redis client for BullMQ job queues.
 * Lazy-initialized — only connects when first accessed.
 */
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisClient.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error:', err.message);
    });
  }

  return redisClient;
}

/**
 * Graceful shutdown — close Redis connection.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected gracefully');
  }
}

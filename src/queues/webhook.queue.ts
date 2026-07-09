import { Queue, Worker } from 'bullmq';
import { getRedisClient } from '../config/redis';
import { logger } from '../config/logger';
import { processWebhookEvent } from '../services/webhook.service';

/**
 * BullMQ webhook processing queue.
 * Offloads webhook processing from the main request handler to avoid blocking.
 * In production with high volume, this prevents webhook timeout issues.
 */

let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;

/**
 * Initialize the webhook processing queue.
 * Call this after Redis is connected.
 */
export function initWebhookQueue(io: any): void {
  try {
    const connection = getRedisClient() as any;

    webhookQueue = new Queue('webhook-processing', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });

    webhookWorker = new Worker(
      'webhook-processing',
      async (job) => {
        const { entries } = job.data;
        await processWebhookEvent(entries, io);
      },
      {
        connection,
        concurrency: 5,
        limiter: {
          max: 50,
          duration: 1000, // Max 50 jobs per second
        },
      }
    );

    webhookWorker.on('completed', (job) => {
      logger.debug(`Webhook job ${job.id} completed`);
    });

    webhookWorker.on('failed', (job, err) => {
      logger.error(`Webhook job ${job?.id} failed:`, err);
    });

    logger.info('✅ Webhook queue initialized');
  } catch (error) {
    logger.warn('Redis not available — webhook processing will be synchronous:', (error as Error).message);
  }
}

/**
 * Add a webhook event to the processing queue.
 * Falls back to synchronous processing if Redis is unavailable.
 */
export async function enqueueWebhookEvent(entries: any[], io: any): Promise<void> {
  if (webhookQueue) {
    await webhookQueue.add('process-webhook', { entries });
  } else {
    // Fallback: process synchronously
    await processWebhookEvent(entries, io);
  }
}

/**
 * Graceful shutdown.
 */
export async function shutdownQueues(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
  }
  if (webhookQueue) {
    await webhookQueue.close();
  }
}

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { disconnectRedis } from './config/redis';
import { logger } from './config/logger';
import { setupSocketIO } from './socket';

async function startServer(): Promise<void> {
  // Connect to MongoDB
  await connectDatabase();

  // Create HTTP server from Express app
  const httpServer = http.createServer(app);

  // Initialize Socket.IO with CORS for cross-domain (Vercel → Render)
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Set up Socket.IO event handlers
  setupSocketIO(io);

  // Make io accessible to routes via app.locals
  app.set('io', io);

  // Start listening
  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Server running on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`📡 Socket.IO ready`);
    logger.info(`🌐 CORS origin: ${env.FRONTEND_URL}`);
  });

  // =============================================================
  // Graceful shutdown
  // =============================================================
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    httpServer.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Server shut down complete');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

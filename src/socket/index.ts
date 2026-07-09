import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../config/logger';

/**
 * Socket.IO server setup.
 * Handles connection events and room management.
 *
 * Rooms are scoped by waAccountId (tenant) for multi-tenant isolation.
 * Frontend clients join their account room on connection.
 */
export function setupSocketIO(io: SocketIOServer): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Client joins their account room for tenant-scoped events
    socket.on('join-account', (waAccountId: string) => {
      if (waAccountId) {
        socket.join(`account:${waAccountId}`);
        logger.debug(`Socket ${socket.id} joined account:${waAccountId}`);
      }
    });

    // Client joins a specific conversation room for real-time chat
    socket.on('join-conversation', (conversationId: string) => {
      if (conversationId) {
        socket.join(`conversation:${conversationId}`);
        logger.debug(`Socket ${socket.id} joined conversation:${conversationId}`);
      }
    });

    // Client leaves a conversation room
    socket.on('leave-conversation', (conversationId: string) => {
      if (conversationId) {
        socket.leave(`conversation:${conversationId}`);
        logger.debug(`Socket ${socket.id} left conversation:${conversationId}`);
      }
    });

    // Typing indicator (forwarded to conversation room)
    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      socket.to(`conversation:${data.conversationId}`).emit('typing', data);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });
}

/**
 * Emit a real-time event to all clients in an account room.
 * Used when new messages arrive, conversations update, etc.
 */
export function emitToAccount(io: SocketIOServer, waAccountId: string, event: string, data: any): void {
  io.to(`account:${waAccountId}`).emit(event, data);
}

/**
 * Emit a real-time event to all clients in a conversation room.
 */
export function emitToConversation(io: SocketIOServer, conversationId: string, event: string, data: any): void {
  io.to(`conversation:${conversationId}`).emit(event, data);
}

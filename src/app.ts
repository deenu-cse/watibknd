import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { logger } from './config/logger';

// Route imports
import authRoutes from './routes/auth.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import webhookRoutes from './routes/webhook.routes';
import conversationRoutes from './routes/conversation.routes';
import contactRoutes from './routes/contact.routes';
import chatbotRoutes from './routes/chatbot.routes';
import templateRoutes from './routes/template.routes';

const app = express();

// =============================================================
// Security & parsing middleware
// =============================================================

// Helmet — secure HTTP headers
app.use(helmet());

// CORS — whitelist only the frontend origin (Vercel domain in prod).
// credentials: true allows httpOnly cookies to be sent cross-domain.
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Cookie parser — needed to read refresh token from httpOnly cookie
app.use(cookieParser());

// JSON body parser — skip for webhook route (needs raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/webhooks/whatsapp') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});

// URL-encoded parser for form data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// =============================================================
// Request logging (dev only)
// =============================================================
if (env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });
}

// =============================================================
// Health check
// =============================================================
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    message: 'Server is running',
  });
});

// =============================================================
// API Routes
// =============================================================

// Webhook routes FIRST (needs raw body — special middleware inside)
app.use('/api/webhooks', webhookRoutes);

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes (all require auth middleware)
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chatbots', chatbotRoutes);
app.use('/api/templates', templateRoutes);

// =============================================================
// 404 handler
// =============================================================
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    message: 'Route not found',
  });
});

// =============================================================
// Centralized error handler (must be last)
// =============================================================
app.use(errorHandler);

export default app;

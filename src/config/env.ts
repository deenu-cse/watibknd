import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env before anything else
dotenv.config();

/**
 * Environment variable schema — validates all required config at startup.
 * Fails fast with clear error messages if anything is missing.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),

  // MongoDB
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),

  // Encryption for WhatsApp access tokens (AES-256-GCM requires 32 bytes = 64 hex chars)
  TOKEN_ENCRYPTION_KEY: z.string().min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters'),

  // Meta / WhatsApp
  META_APP_SECRET: z.string().default(''),
  META_GRAPH_API_URL: z.string().default('https://graph.facebook.com/v21.0'),
  WEBHOOK_VERIFY_TOKEN: z.string().default('wati-webhook-verify-token'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Email
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('noreply@watisaas.com'),

  // Frontend URL (CORS + email links)
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Cloudinary (optional)
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

/** Helper: are we in production? */
export const isProd = env.NODE_ENV === 'production';

/** Helper: are we in development? */
export const isDev = env.NODE_ENV === 'development';

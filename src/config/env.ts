import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('0.0.0.0'),
  APP_NAME: z.string().default('DevPocket API'),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  FROM_EMAIL: z.string().email().default('noreply@devpocket.app'),
  SUPPORT_EMAIL: z.string().email().default('support@devpocket.app'),

  // URLs
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BASE_URL: z.string().url().default('http://localhost:8000'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(5),

  // Kubernetes
  KUBECONFIG_PATH: z.string().optional(),
  DEFAULT_NAMESPACE: z.string().default('devpocket-environments'),
  CLUSTER_NAME: z.string().default('default-cluster'),

  // WebSocket
  WS_HEARTBEAT_INTERVAL: z.coerce.number().default(30000),
  WS_MAX_CONNECTIONS_PER_USER: z.coerce.number().default(10),

  // Templates
  TEMPLATE_STORAGE_PATH: z.string().default('./templates'),
  DEFAULT_TEMPLATE_RESOURCES_CPU: z.string().default('500m'),
  DEFAULT_TEMPLATE_RESOURCES_MEMORY: z.string().default('1Gi'),
  DEFAULT_TEMPLATE_RESOURCES_STORAGE: z.string().default('10Gi'),

  // Container
  CONTAINER_REGISTRY: z.string().default('docker.io'),
  CONTAINER_CPU_LIMIT: z.string().default('1000m'),
  CONTAINER_MEMORY_LIMIT: z.string().default('2Gi'),
  CONTAINER_STORAGE_LIMIT: z.string().default('10Gi'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),

  // Security
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  ACCOUNT_LOCKOUT_ATTEMPTS: z.coerce.number().default(5),
  ACCOUNT_LOCKOUT_DURATION: z.coerce.number().default(900000), // 15 minutes

  // Subscription Plans
  FREE_PLAN_MAX_ENVIRONMENTS: z.coerce.number().default(1),
  STARTER_PLAN_MAX_ENVIRONMENTS: z.coerce.number().default(3),
  PRO_PLAN_MAX_ENVIRONMENTS: z.coerce.number().default(10),

  // Development
  DEBUG: z.coerce.boolean().default(false),
  ENABLE_API_DOCS: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof envSchema>;

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

let env: Env;

function loadEnvFiles() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Define the priority order for env files based on NODE_ENV
  let envFiles: string[] = [];
  
  if (nodeEnv === 'local' || nodeEnv === 'development') {
    envFiles = ['.env.local', '.env'];
  } else if (nodeEnv === 'production') {
    envFiles = ['.env.prod', '.env.production', '.env'];
  } else if (nodeEnv === 'staging') {
    envFiles = ['.env.staging', '.env'];
  } else {
    // Default fallback
    envFiles = ['.env'];
  }
  
  // Try to load each env file in order, stop at the first successful one
  for (const envFile of envFiles) {
    const envPath = path.resolve(process.cwd(), envFile);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      break;
    }
  }
}

export function loadConfig(): Env {
  // Load environment variables from files based on NODE_ENV
  loadEnvFiles();
  
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join('\n');
      throw new ConfigError(
        `Environment validation failed:\n${missingVars}`
      );
    }
    throw error;
  }
}

export function getConfig(): Env {
  if (!env) {
    env = loadConfig();
  }
  return env;
}

export { ConfigError };

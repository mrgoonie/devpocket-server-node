// Set test environment variables FIRST before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/devpocket_test';
process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-that-is-long-enough';
process.env.LOG_LEVEL = 'info';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.FROM_EMAIL = 'test@example.com';
process.env.SUPPORT_EMAIL = 'support@example.com';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.KUBECONFIG_PATH = '/tmp/kubeconfig';
process.env.DEFAULT_NAMESPACE = 'devpocket-test';

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

// Global test setup
beforeAll(async () => {
  
  // Run database migrations for test database
  try {
    execSync('pnpm prisma migrate deploy', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
  } catch (error) {
    console.warn('Migration failed - this is expected for the first run');
  }
});

// Global test teardown
afterAll(async () => {
  await prisma.$disconnect();
});

// Clean database between tests
beforeEach(async () => {
  // Clean all tables in reverse order to handle foreign key constraints
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  `;
  
  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter(name => name !== '_prisma_migrations')
    .map(name => `"public"."${name}"`)
    .join(', ');

  if (tables.length > 0) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    } catch (error) {
      console.warn('Failed to truncate tables:', error);
    }
  }
});

export { prisma };
// Global test setup - runs once before all tests
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  console.log('🧪 Setting up global test environment...');

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./tests/test.db';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-that-is-long-enough';
  process.env.LOG_LEVEL = 'error';
  process.env.SKIP_DB_SETUP = 'false';

  // Create tests directory if it doesn't exist
  const testsDir = path.join(__dirname);
  if (!fs.existsSync(testsDir)) {
    fs.mkdirSync(testsDir, { recursive: true });
  }

  // Try to set up database - if it fails, we'll use SQLite fallback
  try {
    console.log('Attempting to set up test database...');

    // Check if we can use PostgreSQL
    if (process.env.DATABASE_URL?.includes('postgresql://')) {
      try {
        execSync('pnpm prisma migrate deploy', {
          stdio: 'pipe',
          env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        });
        console.log('✅ PostgreSQL test database set up successfully');
      } catch (error) {
        console.log('⚠️  PostgreSQL not available, falling back to SQLite');
        process.env.DATABASE_URL = 'file:./tests/test.db';
        process.env.SKIP_DB_SETUP = 'true';
      }
    } else {
      console.log('📦 Using SQLite for testing');
      process.env.SKIP_DB_SETUP = 'true';
    }
  } catch (error) {
    console.log('⚠️  Database setup failed, tests will use mocked data');
    process.env.SKIP_DB_SETUP = 'true';
  }

  console.log('✅ Global test setup completed');
}

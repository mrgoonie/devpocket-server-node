// Set test environment variables FIRST before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./tests/test.db';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-that-is-long-enough';
process.env.LOG_LEVEL = 'error';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.FROM_EMAIL = 'test@example.com';
process.env.SUPPORT_EMAIL = 'support@example.com';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.KUBECONFIG_PATH = '/tmp/kubeconfig';
process.env.DEFAULT_NAMESPACE = 'devpocket-test';
process.env.WS_HEARTBEAT_INTERVAL = '30000';
process.env.WS_MAX_CONNECTIONS_PER_USER = '10';
process.env.SECRET_KEY = 'test-secret-key-for-testing-environments-only';
process.env.SKIP_DB_SETUP = 'true'; // Skip all database operations for now

import 'dotenv/config';
import { jest } from '@jest/globals';

// Mock Prisma client for tests that need it
export const prisma = {
  user: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  template: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-template-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  environment: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-env-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  refreshToken: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-token-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  emailVerificationToken: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-verification-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  terminalSession: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-session-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  environmentLog: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-log-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  environmentMetric: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-metric-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  cluster: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-cluster-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  userCluster: {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: (data: any) => Promise.resolve({ id: 'test-user-cluster-id', ...data.data }),
    update: (data: any) => Promise.resolve({ id: data.where.id, ...data.data }),
    delete: () => Promise.resolve({}),
    deleteMany: () => Promise.resolve({ count: 0 }),
  },
  $queryRaw: () => Promise.resolve([]),
  $executeRaw: () => Promise.resolve(0),
  $executeRawUnsafe: () => Promise.resolve(0),
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
};

// All test operations are skipped - using mocked services only
beforeAll(async () => {
  console.log('Test environment initialized with mocked services');
});

afterAll(async () => {
  console.log('Test cleanup completed');
});

beforeEach(() => {
  // Reset all mocks before each test
  jest.clearAllMocks();
});

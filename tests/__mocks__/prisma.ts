// Mock Prisma client for tests
// This provides a fake implementation that works without database
import { jest } from '@jest/globals';

// Use any to avoid complex typing issues in mocks
/* eslint-disable @typescript-eslint/no-explicit-any */

function createMockModel(): any {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({}),
  };
}

export const mockPrismaClient: any = {
  user: createMockModel(),
  refreshToken: createMockModel(),
  emailVerificationToken: createMockModel(),
  cluster: createMockModel(),
  userCluster: createMockModel(),
  template: createMockModel(),
  environment: createMockModel(),
  terminalSession: createMockModel(),
  environmentLog: createMockModel(),
  environmentMetric: createMockModel(),
  
  // Transaction methods
  $transaction: jest.fn().mockImplementation((fn: any) => fn(mockPrismaClient)),
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  
  // Raw queries  
  $queryRaw: jest.fn().mockResolvedValue([{ version: '1.0.0' }]),
  $executeRaw: jest.fn().mockResolvedValue(0),
  $executeRawUnsafe: jest.fn().mockResolvedValue(0),
};

// PrismaClient mock class
export class PrismaClient {
  user = mockPrismaClient.user;
  refreshToken = mockPrismaClient.refreshToken;
  emailVerificationToken = mockPrismaClient.emailVerificationToken;
  cluster = mockPrismaClient.cluster;
  userCluster = mockPrismaClient.userCluster;
  template = mockPrismaClient.template;
  environment = mockPrismaClient.environment;
  terminalSession = mockPrismaClient.terminalSession;
  environmentLog = mockPrismaClient.environmentLog;
  environmentMetric = mockPrismaClient.environmentMetric;
  
  $transaction = mockPrismaClient.$transaction;
  $connect = mockPrismaClient.$connect;
  $disconnect = mockPrismaClient.$disconnect;
  $queryRaw = mockPrismaClient.$queryRaw;
  $executeRaw = mockPrismaClient.$executeRaw;
  $executeRawUnsafe = mockPrismaClient.$executeRawUnsafe;

  constructor() {
    // Mock constructor
  }
}

// Default export for ES modules
export default mockPrismaClient;
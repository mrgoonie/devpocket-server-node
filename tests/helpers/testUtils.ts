import { User, SubscriptionPlan } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { getConfig } from '@/config/env';
import { prisma } from '../setup';

const config = getConfig();

export interface TestUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  subscriptionPlan: SubscriptionPlan;
  isActive: boolean;
  isVerified: boolean;
}

/**
 * Create a test user with default values
 */
export async function createTestUser(overrides: Partial<User> = {}): Promise<TestUser> {
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    username: `testuser-${Date.now()}`,
    fullName: 'Test User',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
    subscriptionPlan: SubscriptionPlan.FREE,
    isActive: true,
    isVerified: true,
    emailVerifiedAt: new Date(),
    ...overrides,
  };

  return await prisma.user.create({
    data: defaultUser,
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      subscriptionPlan: true,
      isActive: true,
      isVerified: true,
    },
  });
}

/**
 * Generate a JWT token for testing
 */
export function generateTestToken(userId: string): string {
  return sign(
    { 
      userId,
      type: 'access',
    },
    config.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

/**
 * Create a test user and return both user and token
 */
export async function createTestUserWithToken(overrides: Partial<User> = {}) {
  const user = await createTestUser(overrides);
  const token = generateTestToken(user.id);
  
  return { user, token };
}

/**
 * Create multiple test users
 */
export async function createTestUsers(count: number): Promise<TestUser[]> {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      email: `test-${i}-${Date.now()}@example.com`,
      username: `testuser-${i}-${Date.now()}`,
      fullName: `Test User ${i}`,
    });
    users.push(user);
  }
  return users;
}

/**
 * Sleep for testing async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random string for testing
 */
export function randomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Clean up test data
 */
export async function cleanupTestData() {
  await prisma.environmentMetric.deleteMany();
  await prisma.environmentLog.deleteMany();
  await prisma.terminalSession.deleteMany();
  await prisma.environment.deleteMany();
  await prisma.userCluster.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.template.deleteMany();
  await prisma.cluster.deleteMany();
}
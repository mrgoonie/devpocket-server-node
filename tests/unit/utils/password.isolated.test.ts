// Set environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/devpocket_test';
process.env.DATABASE_PASSWORD = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-that-is-long-enough';
process.env.LOG_LEVEL = 'info';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.FROM_EMAIL = 'test@example.com';
process.env.SUPPORT_EMAIL = 'support@example.com';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.KUBECONFIG_PATH = '/tmp/kubeconfig';
process.env.DEFAULT_NAMESPACE = 'devpocket-test';

import { hashPassword, comparePassword } from '@/utils/password';

describe('Password Utils - Isolated', () => {
  const testPassword = 'TestPassword123!';

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hash = await hashPassword(testPassword);
      
      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(testPassword);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should verify correct password against hash', async () => {
      const hash = await hashPassword(testPassword);
      const isValid = await comparePassword(testPassword, hash);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password against hash', async () => {
      const hash = await hashPassword(testPassword);
      const isValid = await comparePassword('wrongpassword', hash);
      
      expect(isValid).toBe(false);
    });

    it('should reject password against invalid hash', async () => {
      const isValid = await comparePassword(testPassword, 'invalid-hash');
      
      expect(isValid).toBe(false);
    });
  });
});
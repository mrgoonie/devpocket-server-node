// Set environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOG_LEVEL = 'error';
process.env.SKIP_DB_SETUP = 'true';

import { hashPassword, comparePassword } from '../../../src/utils/password';

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
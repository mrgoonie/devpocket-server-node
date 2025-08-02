import { hashPassword, comparePassword } from '@/utils/password';

describe('Password Utils', () => {
  const testPassword = 'TestPassword123!';

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const hashedPassword = await hashPassword(testPassword);
      
      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
      expect(hashedPassword).not.toBe(testPassword);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for the same password', async () => {
      const hash1 = await hashPassword(testPassword);
      const hash2 = await hashPassword(testPassword);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      const hashedPassword = await hashPassword('');
      
      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const hashedPassword = await hashPassword(testPassword);
      const isValid = await comparePassword(testPassword, hashedPassword);
      
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const hashedPassword = await hashPassword(testPassword);
      const isValid = await comparePassword('WrongPassword123!', hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it('should return false for empty password against hash', async () => {
      const hashedPassword = await hashPassword(testPassword);
      const isValid = await comparePassword('', hashedPassword);
      
      expect(isValid).toBe(false);
    });

    it('should return false for password against empty hash', async () => {
      const isValid = await comparePassword(testPassword, '');
      
      expect(isValid).toBe(false);
    });

    it('should handle case sensitivity', async () => {
      const hashedPassword = await hashPassword(testPassword);
      const isValid = await comparePassword(testPassword.toLowerCase(), hashedPassword);
      
      expect(isValid).toBe(false);
    });
  });
});
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

import { generateTokens, verifyToken, TokenType } from '@/utils/jwt';

describe('JWT Utils - Isolated', () => {
  const mockUserId = 'user_123';

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateTokens(mockUserId);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('should generate tokens with correct payload', async () => {
      const tokens = generateTokens(mockUserId);
      
      const accessPayload = await verifyToken(tokens.accessToken);
      const refreshPayload = await verifyToken(tokens.refreshToken);
      
      expect(accessPayload.userId).toBe(mockUserId);
      expect(accessPayload.type).toBe(TokenType.ACCESS);
      
      expect(refreshPayload.userId).toBe(mockUserId);
      expect(refreshPayload.type).toBe(TokenType.REFRESH);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid tokens', async () => {
      const tokens = generateTokens(mockUserId);
      
      const accessPayload = await verifyToken(tokens.accessToken);
      const refreshPayload = await verifyToken(tokens.refreshToken);
      
      expect(accessPayload.userId).toBe(mockUserId);
      expect(refreshPayload.userId).toBe(mockUserId);
    });

    it('should throw error for invalid tokens', async () => {
      await expect(verifyToken('invalid.token.here')).rejects.toThrow();
    });

    it('should throw error for malformed tokens', async () => {
      await expect(verifyToken('not-a-jwt-token')).rejects.toThrow();
    });

    it('should throw error for tokens with wrong secret', async () => {
      // Generate token with different secret
      const jwt = require('jsonwebtoken');
      const invalidToken = jwt.sign(
        { userId: mockUserId, type: 'access' },
        'wrong-secret',
        { expiresIn: '1h' }
      );
      
      await expect(verifyToken(invalidToken)).rejects.toThrow();
    });
  });
});
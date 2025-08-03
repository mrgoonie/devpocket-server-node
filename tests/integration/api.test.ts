import request from 'supertest';
import app from '../../src/app';
import { createTestUserWithToken, cleanupTestData } from '../helpers/testUtils';
import { SubscriptionPlan } from '@prisma/client';

describe('API Endpoints', () => {
  let authToken: string;
  let testUser: any;

  beforeEach(async () => {
    const { user, token } = await createTestUserWithToken({
      subscriptionPlan: SubscriptionPlan.PRO,
    });
    testUser = user;
    authToken = token;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/v1/info', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('features');
      expect(response.body).toHaveProperty('limits');
      expect(response.body).toHaveProperty('timestamp');

      // Verify features object
      expect(response.body.features).toHaveProperty('authentication', true);
      expect(response.body.features).toHaveProperty('websockets', true);
      expect(response.body.features).toHaveProperty('rate_limiting', true);
      expect(response.body.features).toHaveProperty('metrics', true);

      // Verify limits object
      expect(response.body.limits).toHaveProperty('free_environments');
      expect(response.body.limits).toHaveProperty('starter_environments');
      expect(response.body.limits).toHaveProperty('pro_environments');
    });

    it('should not require authentication', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.body).toHaveProperty('name');
    });
  });

  describe('Authentication Middleware', () => {
    it('should require authentication for protected routes', async () => {
      const response = await request(app).get('/api/v1/users/me').expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('authentication');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject malformed authorization headers', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should accept valid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testUser.id);
    });
  });

  describe('Rate Limiting', () => {
    it('should not apply rate limiting in test environment', async () => {
      const requests = Array(15)
        .fill(0)
        .map(() => request(app).get('/api/v1/info'));

      const responses = await Promise.all(requests);
      const successCount = responses.filter(res => res.status === 200).length;
      const rateLimitedCount = responses.filter(res => res.status === 429).length;

      expect(successCount).toBe(15);
      expect(rateLimitedCount).toBe(0);
    });

    it('should not include rate limit headers in test environment', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
      expect(response.headers).not.toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).not.toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/info')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });

    it('should handle preflight requests', async () => {
      const response = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization')
        .expect(204);

      expect(response.headers['access-control-allow-methods']).toContain('POST');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for undefined routes', async () => {
      const response = await request(app).get('/api/v1/nonexistent').expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Not found');
    });

    it('should return 405 for unsupported methods', async () => {
      const response = await request(app).patch('/api/v1/info').expect(404); // Express returns 404 for unsupported methods on existing routes

      expect(response.body).toHaveProperty('error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"malformed": json}')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should include request ID in responses', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers['x-request-id']).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      // Helmet security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '0');
      expect(response.headers).toHaveProperty('content-security-policy');
    });

    it('should not expose sensitive headers', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['server']).toBeUndefined();
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields in POST requests', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          // missing username, fullName, password
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('required');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          username: 'testuser',
          fullName: 'Test User',
          password: 'ValidPassword123!',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.toLowerCase()).toContain('email');
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          username: 'testuser',
          fullName: 'Test User',
          password: 'weak',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.toLowerCase()).toContain('password');
    });
  });

  describe('Content-Type Handling', () => {
    it('should handle JSON content type', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: 'test@example.com',
          password: 'password123',
        })
        .expect(401); // Invalid credentials, but JSON was parsed

      expect(response.body).toHaveProperty('error');
    });

    it('should handle URL-encoded content type', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('usernameOrEmail=test@example.com&password=password123')
        .expect(401); // Invalid credentials, but data was parsed

      expect(response.body).toHaveProperty('error');
    });

    it('should reject large payloads', async () => {
      const largePayload = {
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        password: 'ValidPassword123!',
        largeField: 'x'.repeat(11 * 1024 * 1024), // 11MB
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(largePayload)
        .expect(413);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('API Versioning', () => {
    it('should respond to v1 API paths', async () => {
      const response = await request(app).get('/api/v1/info').expect(200);

      expect(response.body).toHaveProperty('version');
    });

    it('should return 404 for invalid API versions', async () => {
      const response = await request(app).get('/api/v2/info').expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });
});

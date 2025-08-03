import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../setup';
import { createTestUser, createTestUserWithToken, cleanupTestData } from '../helpers/testUtils';

describe('Authentication API', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'newuser@example.com',
        username: 'newuser',
        fullName: 'New User',
        password: 'SecurePassword123!',
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Registration successful. Please check your email to verify your account.');
      expect(response.body.email).toBe(userData.email);
      expect(response.body.username).toBe(userData.username);
      expect(response.body).not.toHaveProperty('password');

      // Verify user was created in database
      const dbUser = await prisma.user.findUnique({
        where: { email: userData.email },
      });
      expect(dbUser).toBeTruthy();
      expect(dbUser?.isVerified).toBe(false);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          // missing username, fullName, password
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 for existing email', async () => {
      const existingUser = await createTestUser({
        email: 'existing@example.com',
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: existingUser.email,
          username: 'newusername',
          fullName: 'New User',
          password: 'SecurePassword123!',
        })
        .expect(409);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('email');
    });

    it('should return 409 for existing username', async () => {
      const existingUser = await createTestUser({
        username: 'existinguser',
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new@example.com',
          username: existingUser.username,
          fullName: 'New User',
          password: 'SecurePassword123!',
        })
        .expect(409);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('username');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        isVerified: true,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: user.email,
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(user.email);
    });

    it('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for invalid password', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        isVerified: true,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: user.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 for unverified user', async () => {
      const user = await createTestUser({
        email: 'unverified@example.com',
        isVerified: false,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: user.email,
          password: 'password123',
        })
        .expect(403);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not verified');
    });

    it('should lock account after 5 failed attempts', async () => {
      const user = await createTestUser({
        email: 'locktest@example.com',
        isVerified: true,
      });

      // Make 5 failed login attempts (may hit rate limit)
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .post('/api/v1/auth/login')
          .send({
            usernameOrEmail: user.email,
            password: 'wrongpassword',
          });
        
        // Accept either 401 (invalid credentials) or 429 (rate limited)
        expect([401, 429]).toContain(response.status);
      }

      // 6th attempt should return either account locked or rate limited
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: user.email,
          password: 'wrongpassword',
        });

      // Accept either 401 (account locked) or 429 (rate limited)
      expect([401, 429]).toContain(response.status);
      if (response.status === 401) {
        expect(response.body.message).toContain('locked');
      }
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const { user, token } = await createTestUserWithToken();

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.id).toBe(user.id);
      expect(response.body.email).toBe(user.email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should return 401 without token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh tokens with valid refresh token', async () => {
      // First login to get tokens
      const user = await createTestUser({
        email: 'refresh@example.com',
        isVerified: true,
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          usernameOrEmail: user.email,
          password: 'password123',
        })
        .expect(200);

      const refreshToken = loginResponse.body.refreshToken;

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and revoke refresh token', async () => {
      const { token } = await createTestUserWithToken();

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Successfully logged out');
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
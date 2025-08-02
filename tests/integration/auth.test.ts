import request from 'supertest';
import app from '@/app';
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

      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.username).toBe(userData.username);
      expect(response.body.user).not.toHaveProperty('password');

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

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Email already exists');
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

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Username already exists');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
        isVerified: true,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe(user.email);
    });

    it('should return 401 for invalid email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 401 for invalid password', async () => {
      const user = await createTestUser({
        email: 'login@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
        isVerified: true,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 403 for unverified user', async () => {
      const user = await createTestUser({
        email: 'unverified@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
        isVerified: false,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        })
        .expect(403);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not verified');
    });

    it('should lock account after 5 failed attempts', async () => {
      const user = await createTestUser({
        email: 'locktest@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
        isVerified: true,
      });

      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({
            email: user.email,
            password: 'wrongpassword',
          })
          .expect(401);
      }

      // 6th attempt should return account locked
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'wrongpassword',
        })
        .expect(423);

      expect(response.body.error).toContain('locked');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      const { user, token } = await createTestUserWithToken();

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user.id).toBe(user.id);
      expect(response.body.user.email).toBe(user.email);
      expect(response.body.user).not.toHaveProperty('password');
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
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/Lew2bQ2zVNQ4tJKUy', // 'password123'
        isVerified: true,
      });

      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: user.email,
          password: 'password123',
        });

      const refreshToken = loginResponse.body.tokens.refreshToken;

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
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

      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });

    it('should return 401 without token', async () => {
      await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../setup';
import { createTestUserWithToken, cleanupTestData } from '../helpers/testUtils';
import { SubscriptionPlan } from '@prisma/client';

describe('Users API', () => {
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

  describe('GET /api/v1/users/me', () => {
    it('should return current user profile', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(testUser.id);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.fullName).toBe(testUser.fullName);
      expect(response.body.user.subscriptionPlan).toBe(testUser.subscriptionPlan);
      
      // Should not include sensitive fields
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('failedLoginAttempts');
      expect(response.body.user).not.toHaveProperty('accountLockedUntil');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('authentication');
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/users/me', () => {
    it('should update user profile', async () => {
      const updateData = {
        fullName: 'Updated Full Name',
        username: 'updatedusername',
      };

      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.fullName).toBe(updateData.fullName);
      expect(response.body.user.username).toBe(updateData.username);
      expect(response.body.user.email).toBe(testUser.email); // Should not change

      // Verify in database
      const updatedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(updatedUser?.fullName).toBe(updateData.fullName);
      expect(updatedUser?.username).toBe(updateData.username);
    });

    it('should validate username uniqueness', async () => {
      // Create another user
      const otherUser = await prisma.user.create({
        data: {
          email: 'other@example.com',
          username: 'otherusername',
          fullName: 'Other User',
          password: 'hashedpassword',
          isVerified: true,
        },
      });

      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: otherUser.username,
        })
        .expect(409);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Username already exists');
    });

    it('should allow keeping the same username', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: testUser.username,
          fullName: 'Updated Name',
        })
        .expect(200);

      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.fullName).toBe('Updated Name');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          username: '', // Invalid empty username
          fullName: 'Valid Name',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should not allow updating email directly', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'newemail@example.com',
          fullName: 'Updated Name',
        })
        .expect(200);

      // Email should not be updated
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.fullName).toBe('Updated Name');
    });

    it('should not allow updating subscription plan', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subscriptionPlan: SubscriptionPlan.FREE,
          fullName: 'Updated Name',
        })
        .expect(200);

      // Subscription plan should not be updated
      expect(response.body.user.subscriptionPlan).toBe(testUser.subscriptionPlan);
      expect(response.body.user.fullName).toBe('Updated Name');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/api/v1/users/me')
        .send({
          fullName: 'Updated Name',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/users/change-password', () => {
    it('should change password with valid current password', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'password123', // Default test password
          newPassword: 'NewSecurePassword123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Password changed');

      // Verify password was actually changed by trying to login with new password
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'NewSecurePassword123!',
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('tokens');
    });

    it('should reject incorrect current password', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewSecurePassword123!',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('current password');
    });

    it('should validate new password strength', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'weak',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.toLowerCase()).toContain('password');
    });

    it('should require both passwords', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          currentPassword: 'password123',
          // Missing newPassword
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/users/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'NewSecurePassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/users/me', () => {
    it('should delete user account with password confirmation', async () => {
      const response = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'password123',
        })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Account deleted');

      // Verify user was actually deleted
      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(deletedUser).toBeNull();
    });

    it('should reject incorrect password', async () => {
      const response = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'wrongpassword',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('password');

      // Verify user was not deleted
      const existingUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(existingUser).toBeTruthy();
    });

    it('should require password confirmation', async () => {
      const response = await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/users/me')
        .send({
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should cascade delete related data', async () => {
      // Create some related data for the user
      const environment = await prisma.environment.create({
        data: {
          name: 'test-env-to-delete',
          description: 'Environment to be deleted with user',
          userId: testUser.id,
          templateId: 'temp-id',
          clusterId: 'cluster-id',
          dockerImage: 'node:18-alpine',
          port: 3000,
        },
      });

      const refreshToken = await prisma.refreshToken.create({
        data: {
          token: 'test-refresh-token',
          userId: testUser.id,
          expiresAt: new Date(Date.now() + 86400000), // 1 day
        },
      });

      // Delete user account
      await request(app)
        .delete('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          password: 'password123',
        })
        .expect(200);

      // Verify related data was also deleted
      const deletedEnvironment = await prisma.environment.findUnique({
        where: { id: environment.id },
      });
      expect(deletedEnvironment).toBeNull();

      const deletedRefreshToken = await prisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      });
      expect(deletedRefreshToken).toBeNull();
    });
  });

  describe('GET /api/v1/users/stats', () => {
    beforeEach(async () => {
      // Create some test data for stats
      await prisma.environment.createMany({
        data: [
          {
            name: 'env-1',
            description: 'Environment 1',
            userId: testUser.id,
            templateId: 'template-1',
            clusterId: 'cluster-1',
            dockerImage: 'node:18-alpine',
            port: 3000,
            status: 'RUNNING',
          },
          {
            name: 'env-2',
            description: 'Environment 2',
            userId: testUser.id,
            templateId: 'template-2',
            clusterId: 'cluster-1',
            dockerImage: 'python:3.11-slim',
            port: 8000,
            status: 'STOPPED',
          },
        ],
      });
    });

    it('should return user statistics', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalEnvironments');
      expect(response.body.stats).toHaveProperty('runningEnvironments');
      expect(response.body.stats).toHaveProperty('stoppedEnvironments');
      expect(response.body.stats).toHaveProperty('subscriptionPlan');
      expect(response.body.stats).toHaveProperty('accountCreated');

      expect(response.body.stats.totalEnvironments).toBe(2);
      expect(response.body.stats.runningEnvironments).toBe(1);
      expect(response.body.stats.stoppedEnvironments).toBe(1);
      expect(response.body.stats.subscriptionPlan).toBe(testUser.subscriptionPlan);
    });

    it('should include resource usage information', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.stats).toHaveProperty('resourceUsage');
      expect(response.body.stats.resourceUsage).toHaveProperty('environmentsUsed');
      expect(response.body.stats.resourceUsage).toHaveProperty('environmentsLimit');
      expect(response.body.stats.resourceUsage).toHaveProperty('usagePercentage');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/users/stats')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});
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
      const response = await request(app).get('/api/v1/users/me').expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.message).toContain('Access token is required');
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

      expect(response.body.fullName).toBe(updateData.fullName);
      expect(response.body.username).toBe(updateData.username);
      expect(response.body.email).toBe(testUser.email); // Should not change

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
      expect(response.body.error).toContain('Conflict');
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

      expect(response.body.username).toBe(testUser.username);
      expect(response.body.fullName).toBe('Updated Name');
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
      expect(response.body.email).toBe(testUser.email);
      expect(response.body.fullName).toBe('Updated Name');
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
      expect(response.body.subscriptionPlan).toBe(testUser.subscriptionPlan);
      expect(response.body.fullName).toBe('Updated Name');
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
      expect(response.body.error).toContain('Current password is incorrect');
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
      expect(response.body.error.toLowerCase()).toContain('validation failed');
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
      expect(response.body.message).toContain('User account deleted successfully');

      // Verify user was soft deleted (deactivated and anonymized)
      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id },
      });
      expect(deletedUser).toBeTruthy();
      expect(deletedUser?.isActive).toBe(false);
      expect(deletedUser?.email).toContain('deleted_');
      expect(deletedUser?.username).toContain('deleted_');
      expect(deletedUser?.fullName).toBe('Deleted User');
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
      expect(response.body.error).toContain('invalid password');
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
      // First create a cluster and template for the environment
      const cluster = await prisma.cluster.create({
        data: {
          name: 'test-cluster-for-delete',
          description: 'Test cluster',
          provider: 'test',
          region: 'test-region',
          kubeconfig: 'test-kubeconfig',
          status: 'ACTIVE',
          nodeCount: 1,
        },
      });

      const template = await prisma.template.create({
        data: {
          name: 'test-template-for-delete',
          displayName: 'Test Template',
          description: 'Test template',
          category: 'PROGRAMMING_LANGUAGE',
          tags: ['test'],
          dockerImage: 'node:18-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: {},
          startupCommands: [],
          status: 'ACTIVE',
          version: '1.0.0',
        },
      });

      const environment = await prisma.environment.create({
        data: {
          name: 'test-env-to-delete',
          description: 'Environment to be deleted with user',
          userId: testUser.id,
          templateId: template.id,
          clusterId: cluster.id,
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

      // Verify related data was also updated
      const deletedEnvironment = await prisma.environment.findUnique({
        where: { id: environment.id },
      });
      expect(deletedEnvironment).toBeTruthy();
      expect(deletedEnvironment?.status).toBe('TERMINATED');

      const deletedRefreshToken = await prisma.refreshToken.findUnique({
        where: { id: refreshToken.id },
      });
      expect(deletedRefreshToken).toBeTruthy();
      expect(deletedRefreshToken?.revokedAt).toBeTruthy();
    });
  });

  describe('GET /api/v1/users/stats', () => {
    let testCluster: any;
    let testTemplate1: any;
    let testTemplate2: any;

    beforeEach(async () => {
      // Create required cluster and templates first
      testCluster = await prisma.cluster.create({
        data: {
          name: 'stats-test-cluster',
          description: 'Test cluster for stats',
          provider: 'test',
          region: 'test-region',
          kubeconfig: 'test-kubeconfig',
          status: 'ACTIVE',
          nodeCount: 1,
        },
      });

      testTemplate1 = await prisma.template.create({
        data: {
          name: 'stats-template-1',
          displayName: 'Stats Template 1',
          description: 'Test template 1',
          category: 'PROGRAMMING_LANGUAGE',
          tags: ['test'],
          dockerImage: 'node:18-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: {},
          startupCommands: [],
          status: 'ACTIVE',
          version: '1.0.0',
        },
      });

      testTemplate2 = await prisma.template.create({
        data: {
          name: 'stats-template-2',
          displayName: 'Stats Template 2',
          description: 'Test template 2',
          category: 'PROGRAMMING_LANGUAGE',
          tags: ['test'],
          dockerImage: 'python:3.11-slim',
          defaultPort: 8000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: {},
          startupCommands: [],
          status: 'ACTIVE',
          version: '1.0.0',
        },
      });

      // Create some test data for stats
      await prisma.environment.createMany({
        data: [
          {
            name: 'env-1',
            description: 'Environment 1',
            userId: testUser.id,
            templateId: testTemplate1.id,
            clusterId: testCluster.id,
            dockerImage: 'node:18-alpine',
            port: 3000,
            status: 'RUNNING',
          },
          {
            name: 'env-2',
            description: 'Environment 2',
            userId: testUser.id,
            templateId: testTemplate2.id,
            clusterId: testCluster.id,
            dockerImage: 'python:3.11-slim',
            port: 8000,
            status: 'STOPPED',
          },
        ],
      });
    });

    it('should return user statistics', async () => {
      const response = await request(app)
        .get('/api/v1/users/me/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalEnvironments');
      expect(response.body).toHaveProperty('environmentsByStatus');
      expect(response.body).toHaveProperty('recentActivity');
      expect(response.body).toHaveProperty('activeTokens');

      expect(response.body.totalEnvironments).toBe(2);
      expect(response.body.environmentsByStatus).toHaveProperty('RUNNING', 1);
      expect(response.body.environmentsByStatus).toHaveProperty('STOPPED', 1);
    });

    it('should include resource usage information', async () => {
      const response = await request(app)
        .get('/api/v1/users/me/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('recentActivity');
      expect(response.body.recentActivity).toHaveProperty('environmentsCreatedLast7Days');
      expect(response.body.recentActivity).toHaveProperty('environmentsCreatedLast30Days');
      expect(response.body.recentActivity).toHaveProperty('environmentsActiveLastWeek');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/users/me/stats').expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });
});

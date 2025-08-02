import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../setup';
import { createTestUserWithToken, cleanupTestData } from '../helpers/testUtils';
import { SubscriptionPlan, ClusterStatus, TemplateStatus, TemplateCategory } from '@prisma/client';

describe('Environments API', () => {
  let authHeaders: any;
  let testUser: any;
  let testCluster: any;
  let testTemplate: any;

  beforeEach(async () => {
    const { user, token } = await createTestUserWithToken({
      subscriptionPlan: SubscriptionPlan.PRO,
    });
    
    testUser = user;
    authHeaders = { Authorization: `Bearer ${token}` };

    // Create test cluster
    testCluster = await prisma.cluster.create({
      data: {
        name: 'test-cluster',
        description: 'Test cluster for environments',
        provider: 'ovh',
        region: 'eu-west-1',
        kubeconfig: 'encrypted-test-kubeconfig',
        status: ClusterStatus.ACTIVE,
        nodeCount: 1,
      },
    });

    // Create test template
    testTemplate = await prisma.template.create({
      data: {
        name: 'test-template',
        displayName: 'Test Template',
        description: 'Template for testing',
        category: TemplateCategory.PROGRAMMING_LANGUAGE,
        tags: ['test'],
        dockerImage: 'node:18-alpine',
        defaultPort: 3000,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: { NODE_ENV: 'test' },
        startupCommands: ['echo "Starting test environment"'],
        status: TemplateStatus.ACTIVE,
        version: '1.0.0',
      },
    });

    // Add user to cluster
    await prisma.userCluster.create({
      data: {
        userId: testUser.id,
        clusterId: testCluster.id,
        role: 'USER',
      },
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('POST /api/v1/environments', () => {
    it('should create a new environment', async () => {
      const environmentData = {
        name: 'test-env',
        description: 'Test environment',
        templateId: testTemplate.id,
        clusterId: testCluster.id,
        resourcesCpu: '500m',
        resourcesMemory: '1Gi',
        resourcesStorage: '5Gi',
        environmentVariables: {
          NODE_ENV: 'development',
          TEST_VAR: 'test-value',
        },
      };

      const response = await request(app)
        .post('/api/v1/environments')
        .set(authHeaders)
        .send(environmentData)
        .expect(201);

      expect(response.body.name).toBe(environmentData.name);
      expect(response.body.status).toBe('CREATING');

      // Verify environment was created in database
      const dbEnvironment = await prisma.environment.findUnique({
        where: { id: response.body.id },
      });
      expect(dbEnvironment).toBeTruthy();
      expect(dbEnvironment?.name).toBe(environmentData.name);
    });

    it('should return 422 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/environments')
        .set(authHeaders)
        .send({
          name: 'test-env',
          // missing templateId and clusterId
        })
        .expect(422);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 409 for duplicate environment name', async () => {
      // Create first environment
      await prisma.environment.create({
        data: {
          name: 'duplicate-env',
          description: 'First environment',
          userId: testUser.id,
          templateId: testTemplate.id,
          clusterId: testCluster.id,
          dockerImage: 'node:18-alpine',
          port: 3000,
        },
      });

      // Try to create second environment with same name
      const response = await request(app)
        .post('/api/v1/environments')
        .set(authHeaders)
        .send({
          name: 'duplicate-env',
          description: 'Duplicate environment',
          templateId: testTemplate.id,
          clusterId: testCluster.id,
        })
        .expect(409);

      expect(response.body.message).toContain('already exists');
    });

    it('should enforce resource limits based on subscription plan', async () => {
      // Create a FREE plan user
      const { user: freeUser, token: freeToken } = await createTestUserWithToken({
        subscriptionPlan: SubscriptionPlan.FREE,
      });

      // Add free user to cluster
      await prisma.userCluster.create({
        data: {
          userId: freeUser.id,
          clusterId: testCluster.id,
          role: 'USER',
        },
      });

      // Create first environment (should succeed)
      await request(app)
        .post('/api/v1/environments')
        .set({ Authorization: `Bearer ${freeToken}` })
        .send({
          name: 'free-env-1',
          description: 'First free environment',
          templateId: testTemplate.id,
          clusterId: testCluster.id,
        })
        .expect(201);

      // Try to create second environment (should fail for FREE plan)
      const response = await request(app)
        .post('/api/v1/environments')
        .set({ Authorization: `Bearer ${freeToken}` })
        .send({
          name: 'free-env-2',
          description: 'Second free environment',
          templateId: testTemplate.id,
          clusterId: testCluster.id,
        })
        .expect(403);

      expect(response.body.message).toContain('limit');
    });
  });

  describe('GET /api/v1/environments', () => {
    beforeEach(async () => {
      // Create test environments
      await prisma.environment.createMany({
        data: [
          {
            name: 'env-1',
            description: 'Environment 1',
            userId: testUser.id,
            templateId: testTemplate.id,
            clusterId: testCluster.id,
            dockerImage: 'node:18-alpine',
            port: 3000,
            status: 'RUNNING',
          },
          {
            name: 'env-2',
            description: 'Environment 2',
            userId: testUser.id,
            templateId: testTemplate.id,
            clusterId: testCluster.id,
            dockerImage: 'python:3.11-slim',
            port: 8000,
            status: 'STOPPED',
          },
        ],
      });
    });

    it('should list user environments', async () => {
      const response = await request(app)
        .get('/api/v1/environments')
        .set(authHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('environments');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.environments)).toBe(true);
      expect(response.body.environments).toHaveLength(2);
      
      // All environments should belong to the authenticated user
      response.body.environments.forEach((env: any) => {
        expect(env.id).toBeDefined();
        expect(env.name).toBeDefined();
      });
    });

    it('should filter environments by status', async () => {
      const response = await request(app)
        .get('/api/v1/environments?status=RUNNING')
        .set(authHeaders)
        .expect(200);

      expect(response.body.environments).toHaveLength(1);
      expect(response.body.environments[0].status).toBe('RUNNING');
    });

    it('should return empty array for user with no environments', async () => {
      const { token: newUserToken } = await createTestUserWithToken();

      const response = await request(app)
        .get('/api/v1/environments')
        .set({ Authorization: `Bearer ${newUserToken}` })
        .expect(200);

      expect(response.body.environments).toHaveLength(0);
    });
  });

  describe('GET /api/v1/environments/:id', () => {
    let testEnvironment: any;

    beforeEach(async () => {
      testEnvironment = await prisma.environment.create({
        data: {
          name: 'detailed-env',
          description: 'Environment for detailed view',
          userId: testUser.id,
          templateId: testTemplate.id,
          clusterId: testCluster.id,
          dockerImage: 'node:18-alpine',
          port: 3000,
          status: 'RUNNING',
          environmentVariables: { NODE_ENV: 'test' },
        },
      });
    });

    it('should get environment details', async () => {
      const response = await request(app)
        .get(`/api/v1/environments/${testEnvironment.id}`)
        .set(authHeaders)
        .expect(200);

      expect(response.body.id).toBe(testEnvironment.id);
      expect(response.body.name).toBe(testEnvironment.name);
      expect(response.body).toHaveProperty('template');
      expect(response.body).toHaveProperty('cluster');
    });

    it('should return 404 for non-existent environment', async () => {
      const response = await request(app)
        .get('/api/v1/environments/non-existent-id')
        .set(authHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for environment owned by another user', async () => {
      const { token: otherUserToken } = await createTestUserWithToken();

      const response = await request(app)
        .get(`/api/v1/environments/${testEnvironment.id}`)
        .set({ Authorization: `Bearer ${otherUserToken}` })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/v1/environments/:id', () => {
    let testEnvironment: any;

    beforeEach(async () => {
      testEnvironment = await prisma.environment.create({
        data: {
          name: 'env-to-delete',
          description: 'Environment to be deleted',
          userId: testUser.id,
          templateId: testTemplate.id,
          clusterId: testCluster.id,
          dockerImage: 'node:18-alpine',
          port: 3000,
          status: 'STOPPED',
        },
      });
    });

    it('should delete environment', async () => {
      const response = await request(app)
        .delete(`/api/v1/environments/${testEnvironment.id}`)
        .set(authHeaders)
        .expect(200);

      expect(response.body).toHaveProperty('message');

      // Verify environment was deleted
      const deletedEnvironment = await prisma.environment.findUnique({
        where: { id: testEnvironment.id },
      });
      expect(deletedEnvironment).toBeNull();
    });

    it('should return 404 for non-existent environment', async () => {
      const response = await request(app)
        .delete('/api/v1/environments/non-existent-id')
        .set(authHeaders)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return 404 for environment owned by another user', async () => {
      const { token: otherUserToken } = await createTestUserWithToken();

      const response = await request(app)
        .delete(`/api/v1/environments/${testEnvironment.id}`)
        .set({ Authorization: `Bearer ${otherUserToken}` })
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should prevent deletion of running environment', async () => {
      // Update environment to running status
      await prisma.environment.update({
        where: { id: testEnvironment.id },
        data: { status: 'RUNNING' },
      });

      const response = await request(app)
        .delete(`/api/v1/environments/${testEnvironment.id}`)
        .set(authHeaders)
        .expect(400);

      expect(response.body.error).toContain('running');
    });
  });
});
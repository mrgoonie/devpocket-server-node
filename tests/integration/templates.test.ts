import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../setup';
import { createTestUserWithToken, cleanupTestData } from '../helpers/testUtils';
import { SubscriptionPlan, TemplateStatus, TemplateCategory } from '@prisma/client';

describe('Templates API', () => {
  let authToken: string;
  let testTemplates: any[];

  beforeEach(async () => {
    const { token } = await createTestUserWithToken({
      subscriptionPlan: SubscriptionPlan.PRO,
    });
    authToken = token;

    // Create test templates
    testTemplates = await Promise.all([
      prisma.template.create({
        data: {
          name: 'nodejs-template',
          displayName: 'Node.js Template',
          description: 'Template for Node.js applications',
          category: TemplateCategory.PROGRAMMING_LANGUAGE,
          tags: ['nodejs', 'javascript', 'web'],
          dockerImage: 'node:18-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: { 
            NODE_ENV: 'development',
            PORT: '3000'
          },
          startupCommands: [
            'npm install',
            'npm start'
          ],
          status: TemplateStatus.ACTIVE,
          version: '1.0.0',
        },
      }),
      prisma.template.create({
        data: {
          name: 'python-template',
          displayName: 'Python Template',
          description: 'Template for Python applications',
          category: TemplateCategory.PROGRAMMING_LANGUAGE,
          tags: ['python', 'data-science', 'ml'],
          dockerImage: 'python:3.11-slim',
          defaultPort: 8000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '2Gi',
          defaultResourcesStorage: '15Gi',
          environmentVariables: { 
            PYTHONPATH: '/app',
            PYTHON_ENV: 'development'
          },
          startupCommands: [
            'pip install -r requirements.txt',
            'python app.py'
          ],
          status: TemplateStatus.ACTIVE,
          version: '2.1.0',
        },
      }),
      prisma.template.create({
        data: {
          name: 'react-template',
          displayName: 'React Template',
          description: 'Template for React applications',
          category: TemplateCategory.FRAMEWORK,
          tags: ['react', 'frontend', 'javascript'],
          dockerImage: 'node:18-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: { 
            NODE_ENV: 'development',
            REACT_APP_ENV: 'development'
          },
          startupCommands: [
            'npm install',
            'npm run dev'
          ],
          status: TemplateStatus.ACTIVE,
          version: '1.5.0',
        },
      }),
      prisma.template.create({
        data: {
          name: 'deprecated-template',
          displayName: 'Deprecated Template',
          description: 'This template is deprecated',
          category: TemplateCategory.PROGRAMMING_LANGUAGE,
          tags: ['deprecated'],
          dockerImage: 'node:14-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '500m',
          defaultResourcesMemory: '1Gi',
          defaultResourcesStorage: '10Gi',
          environmentVariables: {},
          startupCommands: [],
          status: TemplateStatus.DEPRECATED,
          version: '0.9.0',
        },
      }),
    ]);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe('GET /api/v1/templates', () => {
    it('should list all active templates', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
      
      // Should only return active templates
      const activeTemplates = response.body.templates;
      expect(activeTemplates).toHaveLength(3); // 3 active templates
      
      activeTemplates.forEach((template: any) => {
        expect(template.status).toBe('ACTIVE');
        expect(template).toHaveProperty('id');
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('displayName');
        expect(template).toHaveProperty('description');
        expect(template).toHaveProperty('category');
        expect(template).toHaveProperty('tags');
        expect(template).toHaveProperty('dockerImage');
        expect(template).toHaveProperty('defaultPort');
        expect(template).toHaveProperty('version');
        expect(template).toHaveProperty('popularity');
      });
    });

    it('should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/v1/templates?category=PROGRAMMING_LANGUAGE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates).toHaveLength(2); // nodejs and python
      response.body.templates.forEach((template: any) => {
        expect(template.category).toBe('PROGRAMMING_LANGUAGE');
      });
    });

    it('should filter templates by tags', async () => {
      const response = await request(app)
        .get('/api/v1/templates?tags=javascript')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates.length).toBeGreaterThan(0);
      response.body.templates.forEach((template: any) => {
        expect(template.tags).toContain('javascript');
      });
    });

    it('should search templates by name', async () => {
      const response = await request(app)
        .get('/api/v1/templates?search=node')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates.length).toBeGreaterThan(0);
      const template = response.body.templates.find((t: any) => t.name === 'nodejs-template');
      expect(template).toBeTruthy();
    });

    it('should sort templates by popularity', async () => {
      const response = await request(app)
        .get('/api/v1/templates?sortBy=popularity&sortOrder=desc')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = response.body.templates;
      expect(templates.length).toBeGreaterThan(1);
      
      // Check if sorted by popularity (descending)
      for (let i = 0; i < templates.length - 1; i++) {
        expect(templates[i].popularity).toBeGreaterThanOrEqual(templates[i + 1].popularity);
      }
    });

    it('should limit results with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/templates?limit=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should handle pagination offset', async () => {
      const firstPage = await request(app)
        .get('/api/v1/templates?limit=2&page=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const secondPage = await request(app)
        .get('/api/v1/templates?limit=2&page=2')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should return different results
      const firstPageIds = firstPage.body.templates.map((t: any) => t.id);
      const secondPageIds = secondPage.body.templates.map((t: any) => t.id);
      
      expect(firstPageIds).not.toEqual(secondPageIds);
    });

    it('should not require authentication for public templates', async () => {
      const response = await request(app)
        .get('/api/v1/templates')
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
    });

    it('should include deprecated templates when specifically requested', async () => {
      const response = await request(app)
        .get('/api/v1/templates?includeDeprecated=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates).toHaveLength(4); // All templates including deprecated
      
      const deprecatedTemplate = response.body.templates.find((t: any) => t.status === 'DEPRECATED');
      expect(deprecatedTemplate).toBeTruthy();
    });
  });

  describe('GET /api/v1/templates/:id', () => {
    it('should return template details', async () => {
      const template = testTemplates[0];
      
      const response = await request(app)
        .get(`/api/v1/templates/${template.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('template');
      expect(response.body.template.id).toBe(template.id);
      expect(response.body.template.name).toBe(template.name);
      expect(response.body.template.displayName).toBe(template.displayName);
      expect(response.body.template.description).toBe(template.description);
      expect(response.body.template.category).toBe(template.category);
      expect(response.body.template.tags).toEqual(template.tags);
      expect(response.body.template.dockerImage).toBe(template.dockerImage);
      expect(response.body.template.defaultPort).toBe(template.defaultPort);
      expect(response.body.template.environmentVariables).toEqual(template.environmentVariables);
      expect(response.body.template.startupCommands).toEqual(template.startupCommands);
      expect(response.body.template.version).toBe(template.version);
    });

    it('should include resource requirements', async () => {
      const template = testTemplates[0];
      
      const response = await request(app)
        .get(`/api/v1/templates/${template.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.template).toHaveProperty('defaultResourcesCpu');
      expect(response.body.template).toHaveProperty('defaultResourcesMemory');
      expect(response.body.template).toHaveProperty('defaultResourcesStorage');
      expect(response.body.template.defaultResourcesCpu).toBe(template.defaultResourcesCpu);
      expect(response.body.template.defaultResourcesMemory).toBe(template.defaultResourcesMemory);
      expect(response.body.template.defaultResourcesStorage).toBe(template.defaultResourcesStorage);
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get('/api/v1/templates/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Template not found');
    });

    it('should return 404 for deprecated template by default', async () => {
      const deprecatedTemplate = testTemplates.find(t => t.status === 'DEPRECATED');
      
      const response = await request(app)
        .get(`/api/v1/templates/${deprecatedTemplate.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    it('should return deprecated template when explicitly requested', async () => {
      const deprecatedTemplate = testTemplates.find(t => t.status === 'DEPRECATED');
      
      const response = await request(app)
        .get(`/api/v1/templates/${deprecatedTemplate.id}?includeDeprecated=true`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.template.id).toBe(deprecatedTemplate.id);
      expect(response.body.template.status).toBe('DEPRECATED');
    });

    it('should not require authentication for active templates', async () => {
      const template = testTemplates[0];
      
      const response = await request(app)
        .get(`/api/v1/templates/${template.id}`)
        .expect(200);

      expect(response.body.template.id).toBe(template.id);
    });
  });

  describe('Template Categories', () => {
    it('should return all available categories', async () => {
      const response = await request(app)
        .get('/api/v1/templates/categories')
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      expect(Array.isArray(response.body.categories)).toBe(true);
      expect(response.body.categories).toContain('PROGRAMMING_LANGUAGE');
      expect(response.body.categories).toContain('FRAMEWORK');
    });

    it('should include category counts', async () => {
      const response = await request(app)
        .get('/api/v1/templates/categories?includeCounts=true')
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      response.body.categories.forEach((category: any) => {
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('count');
        expect(typeof category.count).toBe('number');
      });
    });
  });

  describe('Popular Templates', () => {
    it('should return most popular templates', async () => {
      const response = await request(app)
        .get('/api/v1/templates/popular')
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(Array.isArray(response.body.templates)).toBe(true);
      
      const templates = response.body.templates;
      
      // Should be sorted by popularity (descending)
      for (let i = 0; i < templates.length - 1; i++) {
        expect(templates[i].popularity).toBeGreaterThanOrEqual(templates[i + 1].popularity);
      }
    });

    it('should limit popular templates count', async () => {
      const response = await request(app)
        .get('/api/v1/templates/popular?limit=2')
        .expect(200);

      expect(response.body.templates).toHaveLength(2);
    });
  });

  describe('Template Search', () => {
    it('should search templates by multiple criteria', async () => {
      const response = await request(app)
        .get('/api/v1/templates/search?q=javascript&category=PROGRAMMING_LANGUAGE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body).toHaveProperty('searchQuery');
      expect(response.body.searchQuery).toBe('javascript');
      
      response.body.templates.forEach((template: any) => {
        expect(template.category).toBe('PROGRAMMING_LANGUAGE');
        // Should match search query in name, description, or tags
        const searchText = `${template.name} ${template.description} ${template.tags.join(' ')}`.toLowerCase();
        expect(searchText).toContain('javascript');
      });
    });

    it('should handle empty search results', async () => {
      const response = await request(app)
        .get('/api/v1/templates/search?q=nonexistentlanguage')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates).toHaveLength(0);
      expect(response.body).toHaveProperty('total', 0);
    });

    it('should support fuzzy search', async () => {
      const response = await request(app)
        .get('/api/v1/templates/search?q=nod') // Partial match for "node"
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.templates.length).toBeGreaterThan(0);
      const nodeTemplate = response.body.templates.find((t: any) => t.name.includes('nodejs'));
      expect(nodeTemplate).toBeTruthy();
    });
  });

  describe('Template Validation', () => {
    it('should validate template compatibility with user subscription', async () => {
      // Create a premium template that requires higher subscription
      const premiumTemplate = await prisma.template.create({
        data: {
          name: 'premium-template',
          displayName: 'Premium Template',
          description: 'Premium template requiring PRO subscription',
          category: TemplateCategory.FRAMEWORK,
          tags: ['premium'],
          dockerImage: 'node:18-alpine',
          defaultPort: 3000,
          defaultResourcesCpu: '2000m', // High CPU requirement
          defaultResourcesMemory: '8Gi', // High memory requirement
          defaultResourcesStorage: '50Gi',
          environmentVariables: {},
          startupCommands: [],
          status: TemplateStatus.ACTIVE,
          version: '1.0.0',
        },
      });

      // Test with PRO user (should work)
      const proResponse = await request(app)
        .get(`/api/v1/templates/${premiumTemplate.id}/compatibility`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(proResponse.body).toHaveProperty('compatible', true);
      expect(proResponse.body).toHaveProperty('subscriptionLevel');

      // Test with FREE user (should indicate incompatibility)
      const { token: freeToken } = await createTestUserWithToken({
        subscriptionPlan: SubscriptionPlan.FREE,
      });

      const freeResponse = await request(app)
        .get(`/api/v1/templates/${premiumTemplate.id}/compatibility`)
        .set('Authorization', `Bearer ${freeToken}`)
        .expect(200);

      expect(freeResponse.body).toHaveProperty('compatible', false);
      expect(freeResponse.body).toHaveProperty('reason');
      expect(freeResponse.body.reason).toContain('subscription');
    });
  });

  describe('Template Usage Statistics', () => {
    it('should track template usage when creating environments', async () => {
      const template = testTemplates[0];
      
      // The template usage tracking is now handled through the usageCount field on template
      // which gets incremented when environments are created using the template

      const response = await request(app)
        .get(`/api/v1/templates/${template.id}/stats`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalUsage');
      expect(response.body.stats).toHaveProperty('uniqueUsers');
      expect(response.body.stats).toHaveProperty('recentUsage');
      expect(response.body.stats.totalUsage).toBeGreaterThan(0);
    });
  });
});
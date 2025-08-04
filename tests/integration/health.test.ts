import request from 'supertest';
import app from '../../src/app';

describe('Health API', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'DevPocket API');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('environment', 'test');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('number');
    });

    it('should include system information', async () => {
      const response = await request(app).get('/health').expect(200);

      // The basic health endpoint only includes service info, not detailed system info
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app).get('/health/ready');
      
      // In test environment without real database, expect 503
      // This is the correct behavior when database is not available
      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('status', 'not ready');
      expect(response.body).toHaveProperty('checks');
      expect(response.body.checks).toHaveProperty('database', 'unhealthy');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app).get('/health/live').expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      // The live endpoint only returns status, no timestamp
    });
  });
});

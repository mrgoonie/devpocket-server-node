import request from 'supertest';
import app from '../../src/app';

describe('Health API Backward Compatibility', () => {
  describe('GET /health - Legacy field preservation', () => {
    it('should preserve all original health endpoint fields', async () => {
      const response = await request(app).get('/health').expect(200);

      // Original fields that must be preserved
      const requiredLegacyFields = [
        'status',
        'service', 
        'version',
        'environment',
        'timestamp'
      ];

      requiredLegacyFields.forEach(field => {
        expect(response.body).toHaveProperty(field);
      });

      // Verify original field types and values
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('DevPocket API');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.environment).toBe('test');
      expect(typeof response.body.timestamp).toBe('number');
    });

    it('should maintain original field types and formats', async () => {
      const response = await request(app).get('/health').expect(200);

      // Type validation for legacy fields
      expect(typeof response.body.status).toBe('string');
      expect(typeof response.body.service).toBe('string');
      expect(typeof response.body.version).toBe('string');
      expect(typeof response.body.environment).toBe('string');
      expect(typeof response.body.timestamp).toBe('number');

      // Format validation
      expect(response.body.timestamp).toBeGreaterThan(0);
      expect(Number.isFinite(response.body.timestamp)).toBe(true);
    });

    it('should add new fields without breaking existing structure', async () => {
      const response = await request(app).get('/health').expect(200);

      // Verify new fields are added
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('uptime');

      // Verify new field types
      expect(typeof response.body.startTime).toBe('number');
      expect(typeof response.body.uptime).toBe('string');

      // Ensure the response structure is extended, not replaced
      const expectedTotalFields = 7; // 5 original + 2 new
      expect(Object.keys(response.body)).toHaveLength(expectedTotalFields);
    });

    it('should maintain timestamp behavior for monitoring tools', async () => {
      const beforeRequest = Date.now() / 1000;
      const response = await request(app).get('/health').expect(200);
      const afterRequest = Date.now() / 1000;

      const timestamp = response.body.timestamp;

      // Timestamp should be current time (within reasonable bounds)
      expect(timestamp).toBeGreaterThanOrEqual(beforeRequest - 1);
      expect(timestamp).toBeLessThanOrEqual(afterRequest + 1);

      // Timestamp should be a Unix timestamp with decimal precision
      expect(timestamp).toBeGreaterThan(1577836800); // After 2020-01-01
      expect(Number.isFinite(timestamp)).toBe(true);
    });

    it('should preserve response format for JSON parsing', async () => {
      const response = await request(app).get('/health').expect(200);

      // Ensure response is valid JSON with no unexpected nesting
      expect(typeof response.body).toBe('object');
      expect(Array.isArray(response.body)).toBe(false);
      expect(response.body).not.toBeNull();

      // All top-level fields should be primitive types (no nested objects)
      Object.values(response.body).forEach(value => {
        expect(['string', 'number', 'boolean'].includes(typeof value)).toBe(true);
      });
    });
  });

  describe('GET /health - Response consistency', () => {
    it('should maintain consistent field ordering for API consumers', async () => {
      // Make multiple requests to ensure consistent field ordering
      const responses = await Promise.all([
        request(app).get('/health').expect(200),
        request(app).get('/health').expect(200),
        request(app).get('/health').expect(200)
      ]);

      const fieldOrders = responses.map(r => Object.keys(r.body));
      
      // All responses should have the same field ordering
      expect(fieldOrders[0]).toEqual(fieldOrders[1]);
      expect(fieldOrders[1]).toEqual(fieldOrders[2]);
    });

    it('should preserve HTTP response format and headers', async () => {
      const response = await request(app).get('/health').expect(200);

      // Verify content-type is still JSON
      expect(response.headers['content-type']).toMatch(/application\/json/);

      // Verify response is not empty
      expect(Object.keys(response.body).length).toBeGreaterThan(0);

      // Verify status code remains 200
      expect(response.status).toBe(200);
    });

    it('should handle monitoring tool expectations', async () => {
      const response = await request(app).get('/health').expect(200);

      // Common monitoring tool checks that should continue to work
      expect(response.body.status).toBe('healthy');
      expect(response.status).toBe(200);
      
      // Should have timestamp for trend analysis
      expect(typeof response.body.timestamp).toBe('number');
      
      // Should have service identification
      expect(response.body.service).toBeTruthy();
      expect(response.body.version).toBeTruthy();
      expect(response.body.environment).toBeTruthy();
    });
  });

  describe('GET /health - Legacy client compatibility', () => {
    interface LegacyHealthResponse {
      status: string;
      service: string;
      version: string;
      environment: string;
      timestamp: number;
    }

    it('should work with legacy TypeScript interfaces', async () => {
      const response = await request(app).get('/health').expect(200);

      // Simulate legacy client code that only knows about original fields
      const legacyResponse: LegacyHealthResponse = {
        status: response.body.status,
        service: response.body.service,
        version: response.body.version,
        environment: response.body.environment,
        timestamp: response.body.timestamp
      };

      // Legacy extraction should work without errors
      expect(legacyResponse.status).toBe('healthy');
      expect(legacyResponse.service).toBe('DevPocket API');
      expect(legacyResponse.version).toBe('1.0.0');
      expect(legacyResponse.environment).toBe('test');
      expect(typeof legacyResponse.timestamp).toBe('number');
    });

    it('should allow legacy clients to ignore new fields', async () => {
      const response = await request(app).get('/health').expect(200);

      // Simulate legacy destructuring that ignores new fields
      const { status, service, version, environment, timestamp } = response.body;

      expect(status).toBe('healthy');
      expect(service).toBe('DevPocket API');
      expect(version).toBe('1.0.0');
      expect(environment).toBe('test');
      expect(typeof timestamp).toBe('number');

      // The destructuring should work even though there are additional fields
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should maintain semantic meaning of existing fields', async () => {
      const response = await request(app).get('/health').expect(200);

      // Status should still indicate health
      expect(['healthy', 'unhealthy', 'degraded'].includes(response.body.status)).toBe(true);
      expect(response.body.status).toBe('healthy'); // Current implementation

      // Service name should be consistent
      expect(response.body.service).toBe('DevPocket API');

      // Version should follow semantic versioning pattern
      expect(response.body.version).toMatch(/^\d+\.\d+\.\d+$/);

      // Environment should be a known environment
      expect(['development', 'test', 'staging', 'production'].includes(response.body.environment)).toBe(true);

      // Timestamp should represent current time
      const now = Date.now() / 1000;
      expect(Math.abs(response.body.timestamp - now)).toBeLessThan(5);
    });
  });

  describe('GET /health - Migration safety', () => {
    it('should not break existing curl commands', async () => {
      const response = await request(app).get('/health').expect(200);

      // Common curl-based health check patterns should still work
      expect(response.body.status).toBe('healthy');
      expect(response.status).toBe(200);

      // Response should be parseable by simple JSON tools
      const jsonString = JSON.stringify(response.body);
      const reparsed = JSON.parse(jsonString);
      expect(reparsed).toEqual(response.body);
    });

    it('should support existing load balancer health checks', async () => {
      const response = await request(app).get('/health').expect(200);

      // Load balancers typically check:
      // 1. HTTP 200 status
      expect(response.status).toBe(200);

      // 2. Response body contains "healthy" or similar
      const responseText = JSON.stringify(response.body).toLowerCase();
      expect(responseText).toContain('healthy');

      // 3. Response is returned quickly
      const start = Date.now();
      await request(app).get('/health').expect(200);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should work with existing monitoring configurations', async () => {
      const response = await request(app).get('/health').expect(200);

      // Common monitoring patterns
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');

      // Verify all values are serializable (no functions, undefined, etc.)
      Object.values(response.body).forEach(value => {
        expect(value).not.toBeUndefined();
        expect(typeof value).not.toBe('function');
        expect(typeof value).not.toBe('symbol');
      });
    });
  });
});
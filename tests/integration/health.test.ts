import request from 'supertest';
import app from '../../src/app';

// Helper function to parse uptime string to seconds for comparison
function parseUptimeToSeconds(uptimeString: string): number {
  const parts = uptimeString.split(', ');
  let totalSeconds = 0;

  parts.forEach(part => {
    if (part.includes('day')) {
      totalSeconds += parseInt(part) * 86400;
    } else if (part.includes('hour')) {
      totalSeconds += parseInt(part) * 3600;
    } else if (part.includes('minute')) {
      totalSeconds += parseInt(part) * 60;
    } else if (part.includes('second')) {
      totalSeconds += parseInt(part);
    }
  });

  return totalSeconds;
}

describe('Health API', () => {
  describe('GET /health', () => {
    it('should return health status with all required fields', async () => {
      const response = await request(app).get('/health').expect(200);

      // Verify existing fields (backward compatibility)
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('service', 'DevPocket API');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('environment', 'test');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('number');

      // Verify new fields
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.startTime).toBe('number');
      expect(typeof response.body.uptime).toBe('string');
    });

    it('should have valid startTime and uptime values', async () => {
      const beforeRequest = Date.now() / 1000;
      const response = await request(app).get('/health').expect(200);
      const afterRequest = Date.now() / 1000;

      const { startTime, uptime, timestamp } = response.body;

      // StartTime should be before the current timestamp but after server start
      expect(startTime).toBeLessThanOrEqual(timestamp);
      expect(startTime).toBeLessThanOrEqual(beforeRequest);
      expect(startTime).toBeGreaterThan(0);

      // Uptime should be a properly formatted string
      expect(uptime).toMatch(/^\d+\s+(second|seconds)$|^\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$|.*\s+(hour|hours).*|.*\s+(day|days).*/);

      // Timestamp should be close to current time
      expect(Math.abs(timestamp - afterRequest)).toBeLessThan(5); // Within 5 seconds
    });

    it('should maintain consistency between multiple requests', async () => {
      const response1 = await request(app).get('/health').expect(200);
      
      // Wait a small amount to ensure uptime increases
      await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 seconds
      
      const response2 = await request(app).get('/health').expect(200);

      // StartTime should be identical between requests
      expect(response2.body.startTime).toBe(response1.body.startTime);

      // Timestamp should be different (newer)
      expect(response2.body.timestamp).toBeGreaterThan(response1.body.timestamp);

      // Uptime should represent more time
      const uptime1Seconds = parseUptimeToSeconds(response1.body.uptime);
      const uptime2Seconds = parseUptimeToSeconds(response2.body.uptime);
      expect(uptime2Seconds).toBeGreaterThanOrEqual(uptime1Seconds);
    });

    it('should include system information', async () => {
      const response = await request(app).get('/health').expect(200);

      // The basic health endpoint includes service info plus new uptime info
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should have proper response structure for monitoring tools', async () => {
      const response = await request(app).get('/health').expect(200);

      // Verify the response contains exactly the expected keys
      const expectedKeys = ['status', 'service', 'version', 'environment', 'timestamp', 'startTime', 'uptime'];
      const actualKeys = Object.keys(response.body).sort();
      expectedKeys.sort();

      expect(actualKeys).toEqual(expectedKeys);
    });

    it('should handle concurrent requests correctly', async () => {
      // Make multiple concurrent requests
      const promises = Array(5).fill(null).map(() => 
        request(app).get('/health').expect(200)
      );
      
      const responses = await Promise.all(promises);

      // All responses should have the same startTime
      const startTimes = responses.map(r => r.body.startTime);
      const uniqueStartTimes = [...new Set(startTimes)];
      expect(uniqueStartTimes).toHaveLength(1);

      // All responses should be valid
      responses.forEach(response => {
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('startTime');
        expect(response.body).toHaveProperty('uptime');
        expect(typeof response.body.startTime).toBe('number');
        expect(typeof response.body.uptime).toBe('string');
      });
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app).get('/health/ready').expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('checks');
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

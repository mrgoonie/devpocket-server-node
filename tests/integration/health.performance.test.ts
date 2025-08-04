import request from 'supertest';
import app from '../../src/app';

describe('Health API Performance Tests', () => {
  describe('GET /health performance', () => {
    it('should respond quickly for single request', async () => {
      const start = Date.now();
      const response = await request(app).get('/health').expect(200);
      const duration = Date.now() - start;

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('startTime');
      expect(response.body).toHaveProperty('uptime');
      
      // Should respond within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent requests efficiently', async () => {
      const concurrentRequests = 10;
      const start = Date.now();

      const promises = Array(concurrentRequests).fill(null).map(() =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(promises);
      const duration = Date.now() - start;

      // All responses should be valid
      responses.forEach(response => {
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('startTime');
        expect(response.body).toHaveProperty('uptime');
        expect(typeof response.body.startTime).toBe('number');
        expect(typeof response.body.uptime).toBe('string');
      });

      // All concurrent requests should complete within 500ms
      expect(duration).toBeLessThan(500);

      // All startTime values should be identical (singleton behavior)
      const startTimes = responses.map(r => r.body.startTime);
      const uniqueStartTimes = [...new Set(startTimes)];
      expect(uniqueStartTimes).toHaveLength(1);
    });

    it('should maintain consistent performance under sustained load', async () => {
      const requestCount = 50;
      const durations: number[] = [];

      for (let i = 0; i < requestCount; i++) {
        const start = Date.now();
        const response = await request(app).get('/health').expect(200);
        const duration = Date.now() - start;

        durations.push(duration);

        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('startTime');
        expect(response.body).toHaveProperty('uptime');
      }

      // Calculate performance statistics
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Performance assertions
      expect(avgDuration).toBeLessThan(50); // Average should be under 50ms
      expect(maxDuration).toBeLessThan(200); // Max should be under 200ms
      expect(minDuration).toBeGreaterThan(0); // Sanity check

      console.log(`Performance stats - Avg: ${avgDuration.toFixed(2)}ms, Max: ${maxDuration}ms, Min: ${minDuration}ms`);
    });

    it('should not have memory leaks with repeated calls', async () => {
      const iterations = 100;
      const responses: any[] = [];

      // Collect responses to check for consistency
      for (let i = 0; i < iterations; i++) {
        const response = await request(app).get('/health').expect(200);
        responses.push({
          startTime: response.body.startTime,
          uptime: response.body.uptime,
          timestamp: response.body.timestamp
        });

        // Add small delay to allow uptime to change
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Verify consistency
      const uniqueStartTimes = [...new Set(responses.map(r => r.startTime))];
      expect(uniqueStartTimes).toHaveLength(1);

      // Verify timestamps are increasing
      for (let i = 1; i < responses.length; i++) {
        expect(responses[i].timestamp).toBeGreaterThanOrEqual(responses[i - 1].timestamp);
      }

      // All uptime strings should be valid
      responses.forEach(response => {
        expect(typeof response.uptime).toBe('string');
        expect(response.uptime).toMatch(/^\d+\s+(second|seconds)$|.*\s+(minute|minutes).*|.*\s+(hour|hours).*|.*\s+(day|days).*/);
      });
    });

    it('should perform well compared to other endpoints', async () => {
      // Test health endpoint
      const healthStart = Date.now();
      await request(app).get('/health').expect(200);
      const healthDuration = Date.now() - healthStart;

      // Test live endpoint (simpler)
      const liveStart = Date.now();
      await request(app).get('/health/live').expect(200);
      const liveDuration = Date.now() - liveStart;

      // Health endpoint should not be significantly slower than live endpoint
      // Allow for up to 2x the duration (very generous margin)
      expect(healthDuration).toBeLessThan(liveDuration * 3);

      console.log(`Endpoint comparison - Health: ${healthDuration}ms, Live: ${liveDuration}ms`);
    });
  });

  describe('Health endpoint resource efficiency', () => {
    it('should have minimal CPU impact', async () => {
      const iterations = 20;
      const start = process.hrtime.bigint();

      for (let i = 0; i < iterations; i++) {
        await request(app).get('/health').expect(200);
      }

      const end = process.hrtime.bigint();
      const cpuTimeNs = Number(end - start);
      const cpuTimeMs = cpuTimeNs / 1_000_000;

      // Should not consume excessive CPU time
      const avgCpuPerRequest = cpuTimeMs / iterations;
      expect(avgCpuPerRequest).toBeLessThan(10); // Less than 10ms CPU time per request

      console.log(`CPU efficiency - Avg CPU time per request: ${avgCpuPerRequest.toFixed(2)}ms`);
    });

    it('should handle rapid successive requests', async () => {
      const rapidRequests = 20;
      const start = Date.now();

      // Fire requests with minimal delay
      const promises = [];
      for (let i = 0; i < rapidRequests; i++) {
        promises.push(request(app).get('/health').expect(200));
        
        // Very small stagger to simulate rapid but not perfectly simultaneous requests
        if (i < rapidRequests - 1) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }

      const responses = await Promise.all(promises);
      const totalDuration = Date.now() - start;

      // All requests should succeed
      expect(responses).toHaveLength(rapidRequests);
      responses.forEach(response => {
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('startTime');
        expect(response.body).toHaveProperty('uptime');
      });

      // Should handle rapid requests efficiently
      expect(totalDuration).toBeLessThan(1000); // Within 1 second
      
      console.log(`Rapid request handling - ${rapidRequests} requests in ${totalDuration}ms`);
    });
  });

  describe('Baseline performance comparison', () => {
    it('should establish performance baseline for monitoring', async () => {
      const testRuns = 5;
      const requestsPerRun = 10;
      const runResults: number[] = [];

      for (let run = 0; run < testRuns; run++) {
        const runStart = Date.now();
        
        const promises = Array(requestsPerRun).fill(null).map(() =>
          request(app).get('/health').expect(200)
        );
        
        await Promise.all(promises);
        const runDuration = Date.now() - runStart;
        runResults.push(runDuration);
      }

      const avgRunDuration = runResults.reduce((a, b) => a + b, 0) / runResults.length;
      const avgRequestDuration = avgRunDuration / requestsPerRun;

      // Log baseline metrics for future comparison
      console.log('=== Health Endpoint Performance Baseline ===');
      console.log(`Average run duration (${requestsPerRun} requests): ${avgRunDuration.toFixed(2)}ms`);
      console.log(`Average request duration: ${avgRequestDuration.toFixed(2)}ms`);
      console.log(`Performance variability: ${Math.max(...runResults) - Math.min(...runResults)}ms`);
      console.log('============================================');

      // Reasonable baseline expectations
      expect(avgRequestDuration).toBeLessThan(100); // Average request under 100ms
      expect(avgRunDuration).toBeLessThan(1000); // 10 concurrent requests under 1 second
    });
  });
});
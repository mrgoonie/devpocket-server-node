import request from 'supertest';
import app from '../../src/app';

// Mock the serverInfo module to test different time scenarios
const mockServerInfo = {
  startTime: new Date(),
  getStartTimeISO: jest.fn(),
  getStartTimeUnix: jest.fn(),
  getUptimeMilliseconds: jest.fn(),
  getUptimeSeconds: jest.fn(),
  getUptimeFormatted: jest.fn()
};

// Store original module for restoration
let originalServerInfo: any;

describe('Health API Time Scenarios', () => {
  beforeAll(() => {
    // Store original for restoration
    originalServerInfo = jest.requireActual('../../../src/utils/serverInfo');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('Real-time uptime progression', () => {
    it('should show increasing uptime over multiple requests', async () => {
      const responses = [];
      const delayBetweenRequests = 1000; // 1 second

      // Make initial request
      const response1 = await request(app).get('/health').expect(200);
      responses.push(response1.body);

      // Wait and make second request
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      const response2 = await request(app).get('/health').expect(200);
      responses.push(response2.body);

      // Wait and make third request
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
      const response3 = await request(app).get('/health').expect(200);
      responses.push(response3.body);

      // Verify startTime consistency
      expect(responses[1].startTime).toBe(responses[0].startTime);
      expect(responses[2].startTime).toBe(responses[0].startTime);

      // Verify uptime progression
      const uptimes = responses.map(parseUptimeToSeconds);
      expect(uptimes[1]).toBeGreaterThanOrEqual(uptimes[0]);
      expect(uptimes[2]).toBeGreaterThanOrEqual(uptimes[1]);

      // Verify timestamp progression
      expect(responses[1].timestamp).toBeGreaterThan(responses[0].timestamp);
      expect(responses[2].timestamp).toBeGreaterThan(responses[1].timestamp);

      console.log('Uptime progression test:');
      responses.forEach((response, i) => {
        console.log(`  Request ${i + 1}: ${response.uptime}`);
      });
    }, 10000); // Increased timeout for this test

    it('should handle concurrent requests with same uptime window', async () => {
      // Fire multiple requests simultaneously
      const promises = Array(5).fill(null).map(() =>
        request(app).get('/health').expect(200)
      );

      const responses = await Promise.all(promises);

      // All should have identical startTime
      const startTimes = responses.map(r => r.body.startTime);
      const uniqueStartTimes = [...new Set(startTimes)];
      expect(uniqueStartTimes).toHaveLength(1);

      // Uptimes should be very close (within 1-2 seconds due to processing time)
      const uptimes = responses.map(r => parseUptimeToSeconds(r.body.uptime));
      const minUptime = Math.min(...uptimes);
      const maxUptime = Math.max(...uptimes);
      expect(maxUptime - minUptime).toBeLessThanOrEqual(2);

      console.log('Concurrent requests uptime range:', 
        `${minUptime}s - ${maxUptime}s (${maxUptime - minUptime}s spread)`);
    });
  });

  describe('Uptime formatting scenarios', () => {
    it('should handle server that just started (under 1 minute)', async () => {
      const response = await request(app).get('/health').expect(200);
      
      // For a freshly started server, uptime should be in seconds
      expect(response.body.uptime).toMatch(/^\d+\s+seconds?$/);
      
      const uptimeSeconds = parseUptimeToSeconds(response.body.uptime);
      expect(uptimeSeconds).toBeLessThan(60);
      expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should validate uptime format consistency', async () => {
      const response = await request(app).get('/health').expect(200);
      
      const uptimeString = response.body.uptime;
      
      // Should match expected patterns
      const patterns = [
        /^\d+\s+seconds?$/,                                                          // "5 seconds"
        /^\d+\s+minutes?,\s+\d+\s+seconds?$/,                                      // "2 minutes, 30 seconds"  
        /^\d+\s+hours?,\s+\d+\s+minutes?,\s+\d+\s+seconds?$/,                      // "1 hour, 15 minutes, 30 seconds"
        /^\d+\s+days?,\s+\d+\s+hours?,\s+\d+\s+minutes?,\s+\d+\s+seconds?$/,       // "2 days, 3 hours, 45 minutes, 12 seconds"
        /^\d+\s+minutes?$/,                                                          // "5 minutes" (no seconds)
        /^\d+\s+hours?$/,                                                            // "2 hours" (no minutes/seconds)
        /^\d+\s+days?$/,                                                             // "1 day" (no hours/minutes/seconds)
        /^\d+\s+hours?,\s+\d+\s+seconds?$/,                                        // "1 hour, 5 seconds" (no minutes)
        /^\d+\s+days?,\s+\d+\s+seconds?$/,                                         // "1 day, 5 seconds" (no hours/minutes)
        /^\d+\s+days?,\s+\d+\s+minutes?,\s+\d+\s+seconds?$/,                       // "1 day, 5 minutes, 30 seconds" (no hours)
        /^\d+\s+days?,\s+\d+\s+hours?$/,                                           // "2 days, 3 hours" (no minutes/seconds)
        /^\d+\s+days?,\s+\d+\s+hours?,\s+\d+\s+minutes?$/,                         // "2 days, 3 hours, 45 minutes" (no seconds)
        /^\d+\s+days?,\s+\d+\s+hours?,\s+\d+\s+seconds?$/,                         // "2 days, 3 hours, 12 seconds" (no minutes)
        /^\d+\s+hours?,\s+\d+\s+minutes?$/                                         // "3 hours, 45 minutes" (no seconds)
      ];
      
      const matchesPattern = patterns.some(pattern => pattern.test(uptimeString));
      expect(matchesPattern).toBe(true);
      
      console.log(`Current uptime format: "${uptimeString}"`);
    });

    it('should maintain mathematical consistency between formats', async () => {
      const response = await request(app).get('/health').expect(200);
      
      const { startTime, timestamp, uptime } = response.body;
      
      // Calculate expected uptime from timestamps
      const calculatedUptimeSeconds = Math.floor(timestamp - startTime);
      const parsedUptimeSeconds = parseUptimeToSeconds(uptime);
      
      // Should be very close (allow for small timing differences)
      const difference = Math.abs(calculatedUptimeSeconds - parsedUptimeSeconds);
      expect(difference).toBeLessThanOrEqual(1);
      
      console.log(`Uptime consistency check:`);
      console.log(`  Calculated: ${calculatedUptimeSeconds}s`);
      console.log(`  Parsed: ${parsedUptimeSeconds}s`);
      console.log(`  Difference: ${difference}s`);
    });
  });

  describe('Edge cases and boundary conditions', () => {
    it('should handle rapid consecutive requests without time conflicts', async () => {
      const rapidRequests = 10;
      const responses = [];
      
      // Fire requests with minimal delay
      for (let i = 0; i < rapidRequests; i++) {
        const response = await request(app).get('/health').expect(200);
        responses.push(response.body);
        
        // Minimal delay to ensure some time progression
        if (i < rapidRequests - 1) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
      
      // All startTimes should be identical
      const startTimes = responses.map(r => r.startTime);
      const uniqueStartTimes = [...new Set(startTimes)];
      expect(uniqueStartTimes).toHaveLength(1);
      
      // Timestamps should be non-decreasing
      for (let i = 1; i < responses.length; i++) {
        expect(responses[i].timestamp).toBeGreaterThanOrEqual(responses[i - 1].timestamp);
      }
      
      // All uptime strings should be valid
      responses.forEach((response, index) => {
        expect(typeof response.uptime).toBe('string');
        expect(response.uptime.length).toBeGreaterThan(0);
        
        const uptimeSeconds = parseUptimeToSeconds(response.uptime);
        expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
        
        console.log(`Rapid request ${index + 1}: ${response.uptime} (${uptimeSeconds}s)`);
      });
    });

    it('should handle timezone independence', async () => {
      const response = await request(app).get('/health').expect(200);
      
      const { startTime, timestamp } = response.body;
      
      // Unix timestamps should be timezone-independent
      expect(typeof startTime).toBe('number');
      expect(typeof timestamp).toBe('number');
      
      // Both should be reasonable Unix timestamps
      const currentTime = Date.now() / 1000;
      expect(startTime).toBeLessThanOrEqual(currentTime);
      expect(timestamp).toBeLessThanOrEqual(currentTime + 1); // Allow small margin
      
      // Should be after 2020 (reasonable sanity check)
      const year2020 = 1577836800; // 2020-01-01 00:00:00 UTC
      expect(startTime).toBeGreaterThan(year2020);
      expect(timestamp).toBeGreaterThan(year2020);
    });

    it('should provide stable references for monitoring', async () => {
      // This test verifies that the health endpoint provides stable references
      // that monitoring systems can rely on
      
      const referenceResponse = await request(app).get('/health').expect(200);
      
      // Wait a bit and get another response
      await new Promise(resolve => setTimeout(resolve, 100));
      const comparisonResponse = await request(app).get('/health').expect(200);
      
      // StartTime should be a stable reference point
      expect(comparisonResponse.body.startTime).toBe(referenceResponse.body.startTime);
      
      // Service info should be stable
      expect(comparisonResponse.body.service).toBe(referenceResponse.body.service);
      expect(comparisonResponse.body.version).toBe(referenceResponse.body.version);
      expect(comparisonResponse.body.environment).toBe(referenceResponse.body.environment);
      expect(comparisonResponse.body.status).toBe(referenceResponse.body.status);
      
      // Only timestamp and uptime should change
      expect(comparisonResponse.body.timestamp).toBeGreaterThanOrEqual(referenceResponse.body.timestamp);
      
      const refUptimeSeconds = parseUptimeToSeconds(referenceResponse.body.uptime);
      const compUptimeSeconds = parseUptimeToSeconds(comparisonResponse.body.uptime);
      expect(compUptimeSeconds).toBeGreaterThanOrEqual(refUptimeSeconds);
    });
  });
});

// Helper function to parse uptime string to seconds
function parseUptimeToSeconds(uptimeString: string): number {
  const parts = uptimeString.split(', ');
  let totalSeconds = 0;

  parts.forEach(part => {
    const match = part.match(/(\d+)\s+(\w+)/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      if (unit.startsWith('day')) {
        totalSeconds += value * 86400;
      } else if (unit.startsWith('hour')) {
        totalSeconds += value * 3600;
      } else if (unit.startsWith('minute')) {
        totalSeconds += value * 60;
      } else if (unit.startsWith('second')) {
        totalSeconds += value;
      }
    }
  });

  return totalSeconds;
}
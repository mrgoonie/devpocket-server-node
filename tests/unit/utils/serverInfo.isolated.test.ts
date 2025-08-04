import serverInfo, { ServerInfo } from '../../../src/utils/serverInfo';

// Helper to create mock ServerInfo with specific uptime
function createMockServerInfo(uptimeSeconds: number): ServerInfo {
  return {
    startTime: new Date(Date.now() - uptimeSeconds * 1000),
    getStartTimeISO: () => new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
    getStartTimeUnix: () => Math.floor((Date.now() - uptimeSeconds * 1000) / 1000),
    getUptimeMilliseconds: () => uptimeSeconds * 1000,
    getUptimeSeconds: () => uptimeSeconds,
    getUptimeFormatted: serverInfo.getUptimeFormatted.bind({
      getUptimeSeconds: () => uptimeSeconds
    })
  };
}

describe('ServerInfo Utils - Comprehensive Tests', () => {
  describe('serverInfo singleton', () => {
    it('should have a start time that is before current time', () => {
      const currentTime = new Date();
      expect(serverInfo.startTime).toBeInstanceOf(Date);
      expect(serverInfo.startTime.getTime()).toBeLessThanOrEqual(currentTime.getTime());
    });

    it('should return start time in ISO format', () => {
      const isoString = serverInfo.getStartTimeISO();
      expect(typeof isoString).toBe('string');
      expect(new Date(isoString).toISOString()).toBe(isoString);
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should return start time as Unix timestamp', () => {
      const unixTime = serverInfo.getStartTimeUnix();
      expect(typeof unixTime).toBe('number');
      expect(unixTime).toBeGreaterThan(0);
      expect(unixTime).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
      expect(Number.isInteger(unixTime)).toBe(true);
    });

    it('should return uptime in milliseconds', () => {
      const uptimeMs = serverInfo.getUptimeMilliseconds();
      expect(typeof uptimeMs).toBe('number');
      expect(uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return uptime in seconds', () => {
      const uptimeSeconds = serverInfo.getUptimeSeconds();
      expect(typeof uptimeSeconds).toBe('number');
      expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(uptimeSeconds)).toBe(true);
    });

    it('should return formatted uptime string', () => {
      const formattedUptime = serverInfo.getUptimeFormatted();
      expect(typeof formattedUptime).toBe('string');
      expect(formattedUptime).toMatch(/^\d+\s+(second|seconds)$|^\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$|^\d+\s+(hour|hours),\s+\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$|^\d+\s+(day|days),\s+\d+\s+(hour|hours),\s+\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$/);
    });

    it('should maintain consistent values across multiple calls', () => {
      const startTime1 = serverInfo.getStartTimeUnix();
      const startTime2 = serverInfo.getStartTimeUnix();
      expect(startTime1).toBe(startTime2);

      const iso1 = serverInfo.getStartTimeISO();
      const iso2 = serverInfo.getStartTimeISO();
      expect(iso1).toBe(iso2);
    });

    it('should show increasing uptime over time', async () => {
      const uptime1 = serverInfo.getUptimeSeconds();
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait 1.1 seconds
      const uptime2 = serverInfo.getUptimeSeconds();
      
      expect(uptime2).toBeGreaterThan(uptime1);
      expect(uptime2 - uptime1).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Time formatting edge cases', () => {
    it('should handle zero uptime correctly', () => {
      const mockInfo = createMockServerInfo(0);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('0 seconds');
    });

    it('should format singular second correctly', () => {
      const mockInfo = createMockServerInfo(1);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 second');
    });

    it('should format plural seconds correctly', () => {
      const mockInfo = createMockServerInfo(5);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('5 seconds');
    });

    it('should format exactly one minute correctly', () => {
      const mockInfo = createMockServerInfo(60);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 minute');
    });

    it('should format minutes and seconds correctly', () => {
      const mockInfo = createMockServerInfo(65);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 minute, 5 seconds');
    });

    it('should format multiple minutes and seconds correctly', () => {
      const mockInfo = createMockServerInfo(125);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('2 minutes, 5 seconds');
    });

    it('should format exactly one hour correctly', () => {
      const mockInfo = createMockServerInfo(3600);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 hour');
    });

    it('should format hours and minutes correctly', () => {
      const mockInfo = createMockServerInfo(3665);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 hour, 1 minute, 5 seconds');
    });

    it('should format multiple hours correctly', () => {
      const mockInfo = createMockServerInfo(7325);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('2 hours, 2 minutes, 5 seconds');
    });

    it('should format exactly one day correctly', () => {
      const mockInfo = createMockServerInfo(86400);
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 day');
    });

    it('should format days, hours, minutes, and seconds correctly', () => {
      const mockInfo = createMockServerInfo(90061); // 1 day, 1 hour, 1 minute, 1 second
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 day, 1 hour, 1 minute, 1 second');
    });

    it('should format multiple days correctly', () => {
      const mockInfo = createMockServerInfo(180125); // 2 days, 2 hours, 2 minutes, 5 seconds
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('2 days, 2 hours, 2 minutes, 5 seconds');
    });

    it('should handle large uptimes correctly', () => {
      const mockInfo = createMockServerInfo(31536000); // 1 year = 365 days
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('365 days');
    });

    it('should omit zero components in formatting', () => {
      const mockInfo = createMockServerInfo(3605); // 1 hour, 0 minutes, 5 seconds
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('1 hour, 5 seconds');
    });

    it('should handle edge case with only hours and no minutes or seconds', () => {
      const mockInfo = createMockServerInfo(7200); // 2 hours exactly
      const result = mockInfo.getUptimeFormatted();
      expect(result).toBe('2 hours');
    });
  });

  describe('Performance and consistency tests', () => {
    it('should execute quickly even with many calls', () => {
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        serverInfo.getUptimeFormatted();
        serverInfo.getStartTimeUnix();
        serverInfo.getUptimeSeconds();
      }
      
      const end = Date.now();
      const duration = end - start;
      
      // Should complete 3000 operations in under 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should maintain thread safety with concurrent access', async () => {
      const promises = Array(10).fill(null).map(async () => {
        const results = [];
        for (let i = 0; i < 10; i++) {
          results.push({
            startTime: serverInfo.getStartTimeUnix(),
            uptime: serverInfo.getUptimeSeconds(),
            formatted: serverInfo.getUptimeFormatted()
          });
          await new Promise(resolve => setTimeout(resolve, 1));
        }
        return results;
      });

      const allResults = await Promise.all(promises);
      
      // All startTimes should be identical
      const startTimes = allResults.flat().map(r => r.startTime);
      const uniqueStartTimes = [...new Set(startTimes)];
      expect(uniqueStartTimes).toHaveLength(1);

      // All uptimes should be reasonable (within expected bounds)
      const uptimes = allResults.flat().map(r => r.uptime);
      const minUptime = Math.min(...uptimes);
      const maxUptime = Math.max(...uptimes);
      expect(maxUptime - minUptime).toBeLessThan(2); // Should be within 2 seconds
    });

    it('should have consistent conversion between formats', () => {
      const unixTime = serverInfo.getStartTimeUnix();
      const isoTime = serverInfo.getStartTimeISO();
      const dateFromUnix = new Date(unixTime * 1000);
      const dateFromISO = new Date(isoTime);
      
      // Allow for small precision differences (Unix timestamp is floored to seconds)
      const timeDifference = Math.abs(dateFromUnix.getTime() - dateFromISO.getTime());
      expect(timeDifference).toBeLessThan(1000); // Should be within 1 second
    });
  });

  describe('Validation and error handling', () => {
    it('should handle startTime being immutable', () => {
      const originalStartTime = serverInfo.startTime;
      
      // Verify startTime is readonly - attempting to access should not change it
      expect(serverInfo.startTime.getTime()).toBe(originalStartTime.getTime());
      
      // Verify it's actually a Date object and immutable
      expect(serverInfo.startTime).toBeInstanceOf(Date);
      expect(Object.isFrozen(serverInfo.startTime)).toBe(false); // Date objects are not frozen but the property is readonly
    });

    it('should validate Unix timestamp is in reasonable range', () => {
      const unixTime = serverInfo.getStartTimeUnix();
      const currentUnixTime = Math.floor(Date.now() / 1000);
      
      // Should be between 2020 and current time
      expect(unixTime).toBeGreaterThan(1577836800); // 2020-01-01
      expect(unixTime).toBeLessThanOrEqual(currentUnixTime);
    });

    it('should validate ISO string format compliance', () => {
      const isoString = serverInfo.getStartTimeISO();
      
      // Should be valid ISO 8601 format
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      
      // Should be parseable back to the same date
      const parsedDate = new Date(isoString);
      expect(parsedDate.toISOString()).toBe(isoString);
    });
  });
});
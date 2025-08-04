import serverInfo from '../../../src/utils/serverInfo';

describe('ServerInfo Utils - Isolated', () => {
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
    });

    it('should return start time as Unix timestamp', () => {
      const unixTime = serverInfo.getStartTimeUnix();
      expect(typeof unixTime).toBe('number');
      expect(unixTime).toBeGreaterThan(0);
      expect(unixTime).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
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
    });

    it('should return formatted uptime string', () => {
      const formattedUptime = serverInfo.getUptimeFormatted();
      expect(typeof formattedUptime).toBe('string');
      expect(formattedUptime).toMatch(/^\d+\s+(second|seconds)$|^\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$|^\d+\s+(hour|hours),\s+\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$|^\d+\s+(day|days),\s+\d+\s+(hour|hours),\s+\d+\s+(minute|minutes),\s+\d+\s+(second|seconds)$/);
    });

    it('should format singular time units correctly', () => {
      // Create mock implementation to test singular formatting
      const mockServerInfo = {
        getUptimeSeconds: () => 1,
        getUptimeFormatted: serverInfo.getUptimeFormatted.bind({
          getUptimeSeconds: () => 1
        })
      };
      
      const result = mockServerInfo.getUptimeFormatted();
      expect(result).toBe('1 second');
    });

    it('should format plural time units correctly', () => {
      // Test with a known value - 65 seconds should be "1 minute, 5 seconds"
      const mockServerInfo = {
        getUptimeSeconds: () => 65,
        getUptimeFormatted: serverInfo.getUptimeFormatted.bind({
          getUptimeSeconds: () => 65
        })
      };
      
      const result = mockServerInfo.getUptimeFormatted();
      expect(result).toBe('1 minute, 5 seconds');
    });

    it('should handle zero uptime correctly', () => {
      const mockServerInfo = {
        getUptimeSeconds: () => 0,
        getUptimeFormatted: serverInfo.getUptimeFormatted.bind({
          getUptimeSeconds: () => 0
        })
      };
      
      const result = mockServerInfo.getUptimeFormatted();
      expect(result).toBe('0 seconds');
    });
  });
});
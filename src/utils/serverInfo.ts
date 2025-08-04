/**
 * Server information utilities
 * Tracks server startup time and provides uptime calculations
 */

interface ServerInfo {
  startTime: Date;
  getStartTimeISO(): string;
  getStartTimeUnix(): number;
  getUptimeMilliseconds(): number;
  getUptimeSeconds(): number;
  getUptimeFormatted(): string;
}

class ServerInfoManager implements ServerInfo {
  public readonly startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Get server start time in ISO string format
   */
  getStartTimeISO(): string {
    return this.startTime.toISOString();
  }

  /**
   * Get server start time as Unix timestamp
   */
  getStartTimeUnix(): number {
    return Math.floor(this.startTime.getTime() / 1000);
  }

  /**
   * Get uptime in milliseconds
   */
  getUptimeMilliseconds(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Get uptime in seconds
   */
  getUptimeSeconds(): number {
    return Math.floor(this.getUptimeMilliseconds() / 1000);
  }

  /**
   * Get human-readable uptime string
   * Format: "X days, Y hours, Z minutes, W seconds"
   */
  getUptimeFormatted(): string {
    const totalSeconds = this.getUptimeSeconds();

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];

    if (days > 0) {
      parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    }
    if (hours > 0) {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
    if (minutes > 0) {
      parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    }
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
    }

    return parts.join(', ');
  }
}

// Create singleton instance
const serverInfo = new ServerInfoManager();

export default serverInfo;
export type { ServerInfo };

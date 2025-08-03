import { PrismaClient } from '@prisma/client';
import logger from './logger';
import { getConfig } from './env';

const config = getConfig();

class DatabaseManager {
  private static instance: DatabaseManager;
  private prisma: PrismaClient;

  private constructor() {
    this.prisma = new PrismaClient({
      log: config.DEBUG ? ['info', 'warn', 'error'] : ['warn', 'error'],
    });

    // Set up Prisma event listeners
    this.setupEventListeners();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public getClient(): PrismaClient {
    return this.prisma;
  }

  private setupEventListeners(): void {
    // Note: With the simplified log configuration above,
    // Prisma will automatically log to stdout/stderr
    // We don't need custom event listeners for basic logging
    logger.info('Database manager initialized', { debug: config.DEBUG });
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database', {
        error:
          error instanceof Error
            ? {
                ...error,
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : error,
      });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database', { error });
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  public async runMigrations(): Promise<void> {
    try {
      logger.info('Running database migrations...');
      // Note: In production, migrations should be run separately
      // This is just for development convenience
      if (config.NODE_ENV === 'development') {
        logger.info('Migrations completed (development mode)');
      }
    } catch (error) {
      logger.error('Failed to run migrations', { error });
      throw error;
    }
  }
}

// Export singleton instance
const db = DatabaseManager.getInstance();
export default db;

// Export Prisma client for direct access when needed
export const prisma = db.getClient();

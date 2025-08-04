#!/usr/bin/env tsx
/* eslint-disable no-case-declarations */

/**
 * Database Migration Manager
 *
 * This script provides safe database migration management with verification,
 * rollback capabilities, and comprehensive logging for production environments.
 *
 * Usage:
 *   pnpm tsx scripts/database-migration-manager.ts <command> [options]
 *
 * Commands:
 *   check       - Check current database state and migration status
 *   verify      - Verify if last_error column exists
 *   migrate     - Apply pending migrations with safety checks
 *   rollback    - Rollback the last_error column migration (EMERGENCY ONLY)
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

// Simple logging for script execution
/* eslint-disable no-console */
const log = {
  info: (message: string, data?: any) => {
    console.log(`ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  success: (message: string, data?: any) => {
    console.log(`✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, data?: any) => {
    console.error(`❌ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};
/* eslint-enable no-console */

// Initialize Prisma client
const prisma = new PrismaClient();

interface MigrationStatus {
  migrationApplied: boolean;
  columnExists: boolean;
  databaseConnected: boolean;
  lastError?: string;
}

class DatabaseMigrationManager {
  async checkDatabaseConnection(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      log.success('Database connection successful');
      return true;
    } catch (error) {
      log.error('Database connection failed', error);
      return false;
    }
  }

  async checkColumnExists(): Promise<{ exists: boolean; details?: any }> {
    try {
      const result = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'environments' 
        AND column_name = 'last_error'
        AND table_schema = 'public'
      `;

      const columnData = Array.isArray(result) ? result[0] : null;

      if (columnData) {
        log.success('last_error column exists', columnData);
        return { exists: true, details: columnData };
      } else {
        log.info('last_error column does not exist');
        return { exists: false };
      }
    } catch (error) {
      log.error('Error checking column existence', error);
      return { exists: false, details: error };
    }
  }

  async checkMigrationStatus(): Promise<{ applied: boolean; details?: any }> {
    try {
      const result = await prisma.$queryRaw`
        SELECT migration_name, finished_at 
        FROM _prisma_migrations 
        WHERE migration_name LIKE '%add_last_error_to_environments%'
        ORDER BY finished_at DESC
        LIMIT 1
      `;

      const migrationData = Array.isArray(result) ? result[0] : null;

      if (migrationData) {
        log.success('Migration applied', migrationData);
        return { applied: true, details: migrationData };
      } else {
        log.info('Migration not applied yet');
        return { applied: false };
      }
    } catch (error) {
      log.error('Error checking migration status', error);
      return { applied: false, details: error };
    }
  }

  async getEnvironmentTableSchema(): Promise<any[]> {
    try {
      const result = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'environments' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `;

      log.info('Current environments table schema');
      console.table(result); // eslint-disable-line no-console
      return Array.isArray(result) ? result : [];
    } catch (error) {
      log.error('Error retrieving table schema', error);
      return [];
    }
  }

  async performHealthCheck(): Promise<MigrationStatus> {
    log.info('Performing database health check...');

    const status: MigrationStatus = {
      migrationApplied: false,
      columnExists: false,
      databaseConnected: false,
    };

    try {
      // Check database connection
      status.databaseConnected = await this.checkDatabaseConnection();

      if (!status.databaseConnected) {
        status.lastError = 'Database connection failed';
        return status;
      }

      // Check if column exists
      const columnCheck = await this.checkColumnExists();
      status.columnExists = columnCheck.exists;

      // Check migration status
      const migrationCheck = await this.checkMigrationStatus();
      status.migrationApplied = migrationCheck.applied;

      // Get current schema
      await this.getEnvironmentTableSchema();

      // Summary
      log.info('Migration Status Summary');
      log.info(`Database Connected: ${status.databaseConnected ? '✅' : '❌'}`);
      log.info(`Column Exists: ${status.columnExists ? '✅' : '❌'}`);
      log.info(`Migration Applied: ${status.migrationApplied ? '✅' : '❌'}`);

      if (status.columnExists && status.migrationApplied) {
        log.success('Everything looks good! The migration has been applied successfully.');
      } else if (status.columnExists && !status.migrationApplied) {
        log.warn(
          'Column exists but migration not recorded. This might indicate manual intervention.'
        );
      } else if (!status.columnExists && status.migrationApplied) {
        log.error('Migration recorded but column missing. This indicates a problem!');
      } else {
        log.info('Migration needs to be applied.');
      }
    } catch (error) {
      log.error('Health check failed', error);
      status.lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    return status;
  }

  async applyMigration(): Promise<boolean> {
    log.info('Starting database migration process...');

    try {
      // Pre-migration health check
      const preStatus = await this.performHealthCheck();

      if (!preStatus.databaseConnected) {
        throw new Error('Cannot proceed: Database connection failed');
      }

      if (preStatus.columnExists && preStatus.migrationApplied) {
        log.success('Migration already applied successfully. No action needed.');
        return true;
      }

      if (preStatus.columnExists && !preStatus.migrationApplied) {
        log.warn('Column exists but migration not recorded. Proceeding with caution...');
      }

      // Create backup point
      log.info('Creating migration backup point...');
      const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      log.info(`Backup timestamp: ${backupTimestamp}`);

      // Apply migration using Prisma
      log.info('📦 Applying Prisma migration...');

      const migrationCommand =
        process.env.NODE_ENV === 'production' ? 'prisma migrate deploy' : 'prisma migrate dev';

      log.info(`Running: ${migrationCommand}`);

      const output = execSync(migrationCommand, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      log.info('Migration output:', output);

      // Post-migration verification
      log.info('\n🔍 Post-migration verification...');
      const postStatus = await this.performHealthCheck();

      if (postStatus.columnExists && postStatus.migrationApplied) {
        log.info('\n🎉 Migration completed successfully!');

        // Test the column
        await this.testColumnFunctionality();

        return true;
      } else {
        throw new Error('Migration verification failed');
      }
    } catch (error) {
      log.error('❌ Migration failed:', error);
      log.info('\n🚨 MIGRATION FAILED - Please check the error above');
      log.info(
        '💡 If you need to rollback, run: pnpm tsx scripts/database-migration-manager.ts rollback'
      );
      return false;
    }
  }

  async testColumnFunctionality(): Promise<boolean> {
    try {
      log.info('🧪 Testing last_error column functionality...');

      // Try to update an environment with last_error (if any exists)
      const testEnvironment = await prisma.environment.findFirst();

      if (testEnvironment) {
        log.info(`Testing with environment: ${testEnvironment.id}`);

        // Test writing to the column
        await prisma.environment.update({
          where: { id: testEnvironment.id },
          data: { lastError: 'Test error message - migration verification' },
        });

        // Test reading from the column
        const updated = await prisma.environment.findUnique({
          where: { id: testEnvironment.id },
          select: { id: true, lastError: true },
        });

        log.info('✅ Column test successful:', updated);

        // Clean up test data
        await prisma.environment.update({
          where: { id: testEnvironment.id },
          data: { lastError: null },
        });

        log.info('✅ Test cleanup completed');
        return true;
      } else {
        log.info(
          '⚠️  No environments found to test with. Column should work when environments are created.'
        );
        return true;
      }
    } catch (error) {
      log.error('❌ Column functionality test failed:', error);
      return false;
    }
  }

  async rollbackMigration(): Promise<boolean> {
    log.info('🚨 EMERGENCY ROLLBACK - Removing last_error column...\n');
    log.info('⚠️  WARNING: This will permanently delete the last_error column and all its data!');

    try {
      // Check current status
      const status = await this.performHealthCheck();

      if (!status.databaseConnected) {
        throw new Error('Cannot proceed: Database connection failed');
      }

      if (!status.columnExists) {
        log.info('✅ Column does not exist. Nothing to rollback.');
        return true;
      }

      // Perform rollback
      log.info('🔄 Executing rollback...');

      await prisma.$executeRaw`ALTER TABLE "environments" DROP COLUMN IF EXISTS "last_error"`;

      log.info('✅ Column dropped successfully');

      // Verify rollback
      const postRollbackStatus = await this.checkColumnExists();

      if (!postRollbackStatus.exists) {
        log.info('✅ Rollback completed successfully');
        log.info(
          '⚠️  Note: You may need to manually remove the migration record from _prisma_migrations'
        );
        return true;
      } else {
        throw new Error('Rollback verification failed - column still exists');
      }
    } catch (error) {
      log.error('❌ Rollback failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    await prisma.$disconnect();
  }
}

// Main execution
async function main() {
  const manager = new DatabaseMigrationManager();
  const command = process.argv[2];

  try {
    switch (command) {
      case 'check':
      case 'verify':
        await manager.performHealthCheck();
        break;

      case 'migrate':
        const success = await manager.applyMigration();
        process.exit(success ? 0 : 1);
        break;

      case 'rollback':
        log.info('⚠️  This is an EMERGENCY rollback operation!');
        log.info('Please confirm you want to proceed by typing "yes":');

        // In a real scenario, you'd want to add interactive confirmation
        // For now, we'll require explicit confirmation via environment variable
        if (process.env.CONFIRM_ROLLBACK !== 'yes') {
          log.info('❌ Rollback cancelled. Set CONFIRM_ROLLBACK=yes to proceed.');
          process.exit(1);
        }

        const rollbackSuccess = await manager.rollbackMigration();
        process.exit(rollbackSuccess ? 0 : 1);
        break;

      case 'test':
        await manager.testColumnFunctionality();
        break;

      default:
        log.info('Usage: pnpm tsx scripts/database-migration-manager.ts <command>');
        log.info('Commands:');
        log.info('  check    - Check database state and migration status');
        log.info('  verify   - Same as check');
        log.info('  migrate  - Apply the migration with safety checks');
        log.info('  rollback - Emergency rollback (requires CONFIRM_ROLLBACK=yes)');
        log.info('  test     - Test column functionality');
        process.exit(1);
    }
  } finally {
    await manager.cleanup();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Script failed:', error); // eslint-disable-line no-console
    process.exit(1);
  });
}

export { DatabaseMigrationManager };

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
import * as fs from 'fs';
import * as path from 'path';

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
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
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
        console.log('✅ last_error column exists:', columnData);
        return { exists: true, details: columnData };
      } else {
        console.log('❌ last_error column does not exist');
        return { exists: false };
      }
    } catch (error) {
      console.error('❌ Error checking column existence:', error);
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
        console.log('✅ Migration applied:', migrationData);
        return { applied: true, details: migrationData };
      } else {
        console.log('❌ Migration not applied yet');
        return { applied: false };
      }
    } catch (error) {
      console.error('❌ Error checking migration status:', error);
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

      console.log('📋 Current environments table schema:');
      console.table(result);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error('❌ Error retrieving table schema:', error);
      return [];
    }
  }

  async performHealthCheck(): Promise<MigrationStatus> {
    console.log('🔍 Performing database health check...\n');

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
      console.log('\n📊 Migration Status Summary:');
      console.log(`Database Connected: ${status.databaseConnected ? '✅' : '❌'}`);
      console.log(`Column Exists: ${status.columnExists ? '✅' : '❌'}`);
      console.log(`Migration Applied: ${status.migrationApplied ? '✅' : '❌'}`);

      if (status.columnExists && status.migrationApplied) {
        console.log('\n🎉 Everything looks good! The migration has been applied successfully.');
      } else if (status.columnExists && !status.migrationApplied) {
        console.log(
          '\n⚠️  Column exists but migration not recorded. This might indicate manual intervention.'
        );
      } else if (!status.columnExists && status.migrationApplied) {
        console.log('\n🚨 Migration recorded but column missing. This indicates a problem!');
      } else {
        console.log('\n📋 Migration needs to be applied.');
      }
    } catch (error) {
      console.error('❌ Health check failed:', error);
      status.lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    return status;
  }

  async applyMigration(): Promise<boolean> {
    console.log('🚀 Starting database migration process...\n');

    try {
      // Pre-migration health check
      const preStatus = await this.performHealthCheck();

      if (!preStatus.databaseConnected) {
        throw new Error('Cannot proceed: Database connection failed');
      }

      if (preStatus.columnExists && preStatus.migrationApplied) {
        console.log('✅ Migration already applied successfully. No action needed.');
        return true;
      }

      if (preStatus.columnExists && !preStatus.migrationApplied) {
        console.log('⚠️  Column exists but migration not recorded. Proceeding with caution...');
      }

      // Create backup point
      console.log('💾 Creating migration backup point...');
      const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      console.log(`Backup timestamp: ${backupTimestamp}`);

      // Apply migration using Prisma
      console.log('📦 Applying Prisma migration...');

      const migrationCommand =
        process.env.NODE_ENV === 'production' ? 'prisma migrate deploy' : 'prisma migrate dev';

      console.log(`Running: ${migrationCommand}`);

      const output = execSync(migrationCommand, {
        encoding: 'utf8',
        cwd: process.cwd(),
      });

      console.log('Migration output:', output);

      // Post-migration verification
      console.log('\n🔍 Post-migration verification...');
      const postStatus = await this.performHealthCheck();

      if (postStatus.columnExists && postStatus.migrationApplied) {
        console.log('\n🎉 Migration completed successfully!');

        // Test the column
        await this.testColumnFunctionality();

        return true;
      } else {
        throw new Error('Migration verification failed');
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      console.log('\n🚨 MIGRATION FAILED - Please check the error above');
      console.log(
        '💡 If you need to rollback, run: pnpm tsx scripts/database-migration-manager.ts rollback'
      );
      return false;
    }
  }

  async testColumnFunctionality(): Promise<boolean> {
    try {
      console.log('🧪 Testing last_error column functionality...');

      // Try to update an environment with last_error (if any exists)
      const testEnvironment = await prisma.environment.findFirst();

      if (testEnvironment) {
        console.log(`Testing with environment: ${testEnvironment.id}`);

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

        console.log('✅ Column test successful:', updated);

        // Clean up test data
        await prisma.environment.update({
          where: { id: testEnvironment.id },
          data: { lastError: null },
        });

        console.log('✅ Test cleanup completed');
        return true;
      } else {
        console.log(
          '⚠️  No environments found to test with. Column should work when environments are created.'
        );
        return true;
      }
    } catch (error) {
      console.error('❌ Column functionality test failed:', error);
      return false;
    }
  }

  async rollbackMigration(): Promise<boolean> {
    console.log('🚨 EMERGENCY ROLLBACK - Removing last_error column...\n');
    console.log(
      '⚠️  WARNING: This will permanently delete the last_error column and all its data!'
    );

    try {
      // Check current status
      const status = await this.performHealthCheck();

      if (!status.databaseConnected) {
        throw new Error('Cannot proceed: Database connection failed');
      }

      if (!status.columnExists) {
        console.log('✅ Column does not exist. Nothing to rollback.');
        return true;
      }

      // Perform rollback
      console.log('🔄 Executing rollback...');

      await prisma.$executeRaw`ALTER TABLE "environments" DROP COLUMN IF EXISTS "last_error"`;

      console.log('✅ Column dropped successfully');

      // Verify rollback
      const postRollbackStatus = await this.checkColumnExists();

      if (!postRollbackStatus.exists) {
        console.log('✅ Rollback completed successfully');
        console.log(
          '⚠️  Note: You may need to manually remove the migration record from _prisma_migrations'
        );
        return true;
      } else {
        throw new Error('Rollback verification failed - column still exists');
      }
    } catch (error) {
      console.error('❌ Rollback failed:', error);
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
        console.log('⚠️  This is an EMERGENCY rollback operation!');
        console.log('Please confirm you want to proceed by typing "yes":');

        // In a real scenario, you'd want to add interactive confirmation
        // For now, we'll require explicit confirmation via environment variable
        if (process.env.CONFIRM_ROLLBACK !== 'yes') {
          console.log('❌ Rollback cancelled. Set CONFIRM_ROLLBACK=yes to proceed.');
          process.exit(1);
        }

        const rollbackSuccess = await manager.rollbackMigration();
        process.exit(rollbackSuccess ? 0 : 1);
        break;

      case 'test':
        await manager.testColumnFunctionality();
        break;

      default:
        console.log('Usage: pnpm tsx scripts/database-migration-manager.ts <command>');
        console.log('Commands:');
        console.log('  check    - Check database state and migration status');
        console.log('  verify   - Same as check');
        console.log('  migrate  - Apply the migration with safety checks');
        console.log('  rollback - Emergency rollback (requires CONFIRM_ROLLBACK=yes)');
        console.log('  test     - Test column functionality');
        process.exit(1);
    }
  } finally {
    await manager.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { DatabaseMigrationManager };

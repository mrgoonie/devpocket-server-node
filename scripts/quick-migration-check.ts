#!/usr/bin/env tsx

/**
 * Quick Migration Check
 *
 * A lightweight script to quickly verify the migration status
 * without performing any changes. Safe to run in any environment.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickCheck() {
  console.log('🔍 DevPocket Database Migration Status Check');
  console.log('============================================\n');

  try {
    // Test connection
    console.log('1. Testing database connection...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('   ✅ Connected successfully\n');

    // Check if environments table exists
    console.log('2. Checking environments table...');
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'environments'
      )
    `;

    if (Array.isArray(tableExists) && tableExists[0]?.exists) {
      console.log('   ✅ environments table exists\n');
    } else {
      console.log('   ❌ environments table does not exist');
      console.log('   💡 Run initial migration first: pnpm db:migrate\n');
      return;
    }

    // Check for last_error column
    console.log('3. Checking last_error column...');
    const columnExists = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'environments' 
      AND column_name = 'last_error'
      AND table_schema = 'public'
    `;

    if (Array.isArray(columnExists) && columnExists.length > 0) {
      console.log('   ✅ last_error column exists');
      console.log('   📋 Column details:', columnExists[0]);
      console.log('');
    } else {
      console.log('   ❌ last_error column does not exist');
      console.log('   🚨 This is the cause of environment creation failures!');
      console.log('   💡 Apply migration with: ./scripts/apply-production-migration.sh\n');
    }

    // Check migration history
    console.log('4. Checking migration history...');
    try {
      const migrations = await prisma.$queryRaw`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations 
        ORDER BY finished_at DESC
        LIMIT 5
      `;

      if (Array.isArray(migrations) && migrations.length > 0) {
        console.log('   📋 Recent migrations:');
        migrations.forEach((migration: any) => {
          const status = migration.rolled_back_at ? '🔄 Rolled back' : '✅ Applied';
          const date = new Date(migration.finished_at).toISOString().split('T')[0];
          console.log(`   ${status} ${migration.migration_name} (${date})`);
        });
        console.log('');
      } else {
        console.log('   ⚠️  No migration history found');
        console.log('   💡 This might be a fresh database\n');
      }
    } catch (error) {
      console.log('   ⚠️  Could not check migration history (table might not exist)');
      console.log("   💡 This is normal for databases that haven't run Prisma migrations\n");
    }

    // Environment count check
    console.log('5. Checking existing environments...');
    try {
      const envCount = await prisma.environment.count();
      console.log(`   📊 Total environments: ${envCount}`);

      if (envCount > 0) {
        const envWithErrors = await prisma.environment.count({
          where: { lastError: { not: null } },
        });
        console.log(`   🚨 Environments with errors: ${envWithErrors}`);
      }
      console.log('');
    } catch (error) {
      console.log('   ❌ Could not query environments table');
      console.log('   💡 This confirms the missing column issue');
      console.log('   Error:', (error as Error).message);
      console.log('');
    }

    // Summary
    console.log('📊 SUMMARY');
    console.log('==========');

    const issues = [];

    // Re-check column for summary
    const finalColumnCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'environments' 
        AND column_name = 'last_error'
        AND table_schema = 'public'
      )
    `;

    const hasColumn = Array.isArray(finalColumnCheck) && finalColumnCheck[0]?.exists;

    if (hasColumn) {
      console.log('✅ Database is ready - last_error column exists');
      console.log('✅ Environment creation should work properly');
    } else {
      console.log('❌ CRITICAL: last_error column is missing');
      console.log('❌ Environment creation will fail');
      console.log('');
      console.log('🚀 TO FIX THIS ISSUE:');
      console.log('   1. Run: ./scripts/apply-production-migration.sh');
      console.log('   2. Or: pnpm tsx scripts/database-migration-manager.ts migrate');
      console.log('   3. Verify: pnpm tsx scripts/quick-migration-check.ts');
    }
  } catch (error) {
    console.error('❌ Check failed:', error);
    console.log('\n💡 Common solutions:');
    console.log('   - Verify DATABASE_URL is set correctly');
    console.log('   - Ensure database server is running');
    console.log('   - Check network connectivity to database');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  quickCheck().catch(console.error);
}

export { quickCheck };

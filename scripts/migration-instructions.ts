#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * Migration Instructions
 *
 * Provides clear, step-by-step instructions for applying the database migration
 */

import { execSync } from 'child_process';
import * as fs from 'fs';

console.log(`
🚀 DevPocket Database Migration Instructions
===========================================

ISSUE: Environment creation failing with "The column environments.last_error does not exist"
SOLUTION: Apply database migration to add the missing column

`);

// Check if we're in the right directory
if (!fs.existsSync('./prisma/schema.prisma')) {
  console.log('❌ Please run this script from the project root directory');
  console.log('   cd /path/to/devpocket-server-node');
  process.exit(1);
}

// Check if migration files exist
const migrationDir = './prisma/migrations/20250804020810_add_last_error_to_environments';
if (!fs.existsSync(migrationDir)) {
  console.log('❌ Migration files not found!');
  console.log('   Expected: ' + migrationDir);
  console.log('   Please ensure you have the latest code with the migration files.');
  process.exit(1);
}

console.log('✅ Migration files found');
console.log('✅ You are in the correct directory');
console.log('');

// Check environment
const hasEnvFile = fs.existsSync('.env');
const hasProdEnvFile = fs.existsSync('.env.prod');

console.log('ENVIRONMENT SETUP:');
console.log('==================');

if (hasEnvFile) {
  console.log('✅ .env file found');
} else {
  console.log('⚠️  .env file not found');
  console.log('   Make sure your DATABASE_URL is set as an environment variable');
}

if (hasProdEnvFile) {
  console.log('✅ .env.prod file found');
} else {
  console.log('⚠️  .env.prod file not found (optional for production)');
}

console.log('');

// Check database connection
console.log('DATABASE CONNECTION TEST:');
console.log('========================');

try {
  console.log('Testing database connection...');
  execSync('pnpm tsx scripts/quick-migration-check.ts', { stdio: 'inherit' });
} catch (error) {
  console.log('❌ Database connection test failed');
  console.log('   Please resolve connection issues before proceeding');
  process.exit(1);
}

console.log(`

MIGRATION OPTIONS:
=================

Choose the option that best fits your situation:

🔥 OPTION 1: Quick Automated Migration (Recommended)
   ./scripts/apply-production-migration.sh
   
   This will:
   - Verify database connection
   - Check current migration status  
   - Apply the migration safely
   - Verify the changes
   - Test functionality

🔧 OPTION 2: Step-by-Step Manual Migration
   pnpm db:migration:check     # Check current status
   pnpm db:migration:apply     # Apply migration
   pnpm db:migration:test      # Test functionality

🏠 OPTION 3: Development Environment
   pnpm db:migrate             # Standard Prisma migration

📊 OPTION 4: Production with Prisma Deploy
   NODE_ENV=production prisma migrate deploy
   # or: pnpm db:migrate:prod

⚡ OPTION 5: Quick Status Check Only
   pnpm db:check               # Non-destructive status check

AFTER MIGRATION:
===============

1. Verify success:
   pnpm db:check

2. Test environment creation through your API

3. Monitor application logs for any issues

4. The last_error column will now store debug information for failed environments

EMERGENCY ROLLBACK (if needed):
==============================

CONFIRM_ROLLBACK=yes pnpm tsx scripts/database-migration-manager.ts rollback

⚠️  WARNING: Rollback will delete the column and all its data!

SUPPORT:
========

- Full documentation: ./scripts/MIGRATION_GUIDE.md
- Troubleshooting: Check the guide for common issues
- Status check: pnpm db:check (safe to run anytime)

Ready to proceed? Choose your preferred option from above.
`);

export {};

# Database Migration Guide: Adding last_error Column

## Overview

This guide covers the critical database migration to add the `last_error` column to the `environments` table. This migration fixes the production issue where environment creation fails with "The column environments.last_error does not exist".

## Current Situation

- **Problem**: Production environment creation failing with missing column error
- **Root Cause**: Database schema is missing the `last_error` column that the application code expects
- **Solution**: Apply the existing Prisma migration to add the column
- **Risk Level**: **LOW** - This is a safe, non-breaking change (adds nullable column)

## Migration Details

### What This Migration Does

```sql
ALTER TABLE "environments" ADD COLUMN "last_error" TEXT;
```

- **Column Name**: `last_error`
- **Data Type**: `TEXT` (nullable)
- **Purpose**: Store error details for debugging environment creation failures
- **Impact**: Non-breaking change, existing code will continue to work

### Files Involved

- **Migration File**: `prisma/migrations/20250804020810_add_last_error_to_environments/migration.sql`
- **Schema File**: `prisma/schema.prisma` (already updated)
- **Management Script**: `scripts/database-migration-manager.ts`
- **Production Script**: `scripts/apply-production-migration.sh`

## Pre-Migration Checklist

### 1. Environment Setup

Ensure you have the correct environment variables set:

```bash
# Required
DATABASE_URL="postgresql://user:password@host:port/database"

# Recommended
NODE_ENV=production
```

### 2. Database Access

Verify you can connect to your production database:

```bash
# Test connection
pnpm tsx scripts/database-migration-manager.ts check
```

### 3. Backup (Highly Recommended)

Create a database backup before proceeding:

```bash
# Manual backup using pg_dump (if available)
pg_dump $DATABASE_URL > backup_before_last_error_migration.sql

# Or use your cloud provider's backup feature
```

## Migration Execution

### Option 1: Automated Script (Recommended)

Use the comprehensive migration script:

```bash
# Make sure you're in the project directory
cd /path/to/devpocket-server-node

# Run the automated migration script
./scripts/apply-production-migration.sh
```

This script will:
1. Verify database connection
2. Check current migration status
3. Create backup (if pg_dump available)
4. Apply the migration
5. Verify migration success
6. Test column functionality

### Option 2: Manual Migration

If you prefer manual control:

```bash
# 1. Check current status
pnpm tsx scripts/database-migration-manager.ts check

# 2. Apply migration
pnpm tsx scripts/database-migration-manager.ts migrate

# 3. Verify success
pnpm tsx scripts/database-migration-manager.ts verify
```

### Option 3: Using Prisma Directly

For direct Prisma migration:

```bash
# Production environment
NODE_ENV=production prisma migrate deploy

# Or using the package.json script
pnpm db:migrate:prod
```

## Post-Migration Verification

### 1. Check Column Exists

```bash
pnpm tsx scripts/database-migration-manager.ts verify
```

Expected output:
```
✅ Database connection successful
✅ last_error column exists: { column_name: 'last_error', data_type: 'text', is_nullable: 'YES' }
✅ Migration applied: { migration_name: '20250804020810_add_last_error_to_environments', finished_at: '2025-01-XX...' }
```

### 2. Test Application Functionality

```bash
# Test the column functionality
pnpm tsx scripts/database-migration-manager.ts test
```

### 3. Verify Environment Creation

Try creating a new environment through your API to ensure the error is resolved.

## Rollback Procedure (Emergency Only)

If you need to rollback the migration:

```bash
# DANGER: This will delete the column and all its data
CONFIRM_ROLLBACK=yes pnpm tsx scripts/database-migration-manager.ts rollback
```

**⚠️ WARNING**: Rollback is destructive and should only be used in emergency situations.

## Common Issues and Troubleshooting

### Issue 1: Database Connection Failed

**Symptoms**: `❌ Database connection failed`

**Solutions**:
- Verify `DATABASE_URL` is correct
- Check network connectivity to database
- Ensure database server is running
- Verify credentials are valid

### Issue 2: Migration Already Applied

**Symptoms**: `✅ Migration already applied successfully. No action needed.`

**Solution**: This is normal - the migration was already applied. Verify with:
```bash
pnpm tsx scripts/database-migration-manager.ts check
```

### Issue 3: Column Exists But Migration Not Recorded

**Symptoms**: `⚠️ Column exists but migration not recorded`

**Possible Causes**:
- Manual database changes
- Previous failed migration attempt
- Database restored from backup

**Solution**: The migration script will handle this gracefully.

### Issue 4: Permission Denied

**Symptoms**: Permission errors when running scripts

**Solutions**:
```bash
# Make scripts executable
chmod +x scripts/apply-production-migration.sh

# Or run with tsx directly
pnpm tsx scripts/database-migration-manager.ts migrate
```

## Monitoring After Migration

### 1. Application Logs

Monitor your application logs for:
- Successful environment creation
- No more "column does not exist" errors
- Proper error logging in the `last_error` column

### 2. Database Monitoring

Watch for:
- Normal query performance
- No unusual database load
- Successful INSERT/UPDATE operations on `environments` table

### 3. Environment Creation Testing

Test environment creation through your API:
```bash
# Example API test (adjust endpoint and auth as needed)
curl -X POST "https://your-api.com/api/v1/environments" \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-env", "templateId": "template-id"}'
```

## Technical Details

### Schema Changes

Before migration:
```sql
-- environments table without last_error column
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- ... other columns ...
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);
```

After migration:
```sql
-- environments table with last_error column
CREATE TABLE "environments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    -- ... other columns ...
    "last_error" TEXT,  -- NEW COLUMN
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);
```

### Prisma Schema

The Prisma schema already includes:
```prisma
model Environment {
  // ... other fields ...
  lastError             String?           @map("last_error") // Store last error details for debugging
  // ... other fields ...
}
```

## Support and Escalation

If you encounter issues:

1. **Check the logs**: All scripts provide detailed logging
2. **Run diagnostics**: Use `pnpm tsx scripts/database-migration-manager.ts check`
3. **Review this guide**: Most issues are covered in troubleshooting
4. **Contact support**: Provide the full error output and migration status

## Success Criteria

The migration is successful when:

- ✅ Database connection works
- ✅ `last_error` column exists in `environments` table  
- ✅ Migration recorded in `_prisma_migrations` table
- ✅ Application can create environments without errors
- ✅ New environments can store error details in `last_error` column

---

**Remember**: This is a critical production fix. Take your time, follow the steps carefully, and don't hesitate to create additional backups if needed.
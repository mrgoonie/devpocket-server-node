#!/bin/bash

# DevPocket Database Migration Rollback Script
# Rolls back the last_error column addition if needed

set -e

echo "⚠️  DevPocket Database Migration Rollback Script"
echo "================================================"
echo ""
echo "This script will REMOVE the last_error column from the environments table"
echo "This should only be used if the migration caused issues"
echo ""

# Confirmation prompt
read -p "Are you sure you want to rollback the migration? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "❌ Rollback cancelled"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "🔄 Rolling back migration..."

# Connect to database and drop the column
pnpm prisma db execute --stdin <<EOF
-- Rollback: Remove last_error column from environments table
ALTER TABLE "environments" DROP COLUMN IF EXISTS "last_error";
EOF

echo "✅ Rollback completed successfully!"
echo "⚠️  Note: You may need to restart your application"
echo "⚠️  Remember to update your Prisma schema if keeping this rollback"
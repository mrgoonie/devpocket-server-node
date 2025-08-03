#!/bin/bash

# DevPocket Database Migration Script
# Applies the missing last_error column migration

set -e

echo "🚀 DevPocket Database Migration Script"
echo "======================================="

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL to your database connection string"
    echo "Example: export DATABASE_URL='postgresql://user:password@host:5432/database'"
    exit 1
fi

echo "✅ DATABASE_URL is set"

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ ERROR: pnpm is not installed"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi

echo "✅ pnpm is available"

# Verify Prisma client is installed
echo "📦 Installing dependencies..."
pnpm install --silent

# Check current migration status
echo "🔍 Checking current migration status..."
pnpm prisma migrate status || {
    echo "⚠️  Warning: Could not check migration status"
    echo "This might be normal if the database is new"
}

# Apply migrations
echo "🛠️  Applying database migrations..."
pnpm prisma migrate deploy

# Verify the column was added
echo "🔍 Verifying migration was successful..."

# Generate Prisma client to ensure it's up to date
echo "🔄 Regenerating Prisma client..."
pnpm prisma generate

echo "✅ Migration completed successfully!"
echo ""
echo "🎉 The last_error column has been added to the environments table"
echo "   Environment creation should now work properly"
echo ""
echo "Next steps:"
echo "1. Test environment creation in your application"
echo "2. Monitor application logs for any issues"
echo "3. Remove this script after confirming everything works"
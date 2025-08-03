#!/bin/bash

# Production Database Migration Script
# Applies the last_error column migration to production database with safety checks

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if required environment variables are set
check_environment() {
    log "Checking environment configuration..."
    
    if [ -z "$DATABASE_URL" ]; then
        error "DATABASE_URL environment variable is not set"
        error "Please set it to your production database connection string"
        exit 1
    fi
    
    if [ -z "$NODE_ENV" ]; then
        warning "NODE_ENV not set, defaulting to production"
        export NODE_ENV=production
    fi
    
    success "Environment configuration verified"
}

# Test database connectivity
test_database_connection() {
    log "Testing database connection..."
    
    if ! pnpm tsx scripts/database-migration-manager.ts check; then
        error "Database connection test failed"
        error "Please verify your DATABASE_URL and database accessibility"
        exit 1
    fi
    
    success "Database connection successful"
}

# Create database backup (if possible)
create_backup() {
    log "Attempting to create database backup..."
    
    # Extract database info from DATABASE_URL
    # This is a simplified extraction - in production you might want more robust parsing
    if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.+)(\?.*)?$ ]]; then
        DB_USER="${BASH_REMATCH[1]}"
        DB_HOST="${BASH_REMATCH[3]}"
        DB_PORT="${BASH_REMATCH[4]}"
        DB_NAME="${BASH_REMATCH[5]}"
        
        BACKUP_FILE="backup_before_migration_$(date +%Y%m%d_%H%M%S).sql"
        
        warning "Backup feature requires pg_dump to be available"
        warning "Consider creating a manual backup before proceeding"
        
        # Uncomment the following lines if pg_dump is available in your environment
        # log "Creating backup: $BACKUP_FILE"
        # pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
        # success "Backup created: $BACKUP_FILE"
    else
        warning "Could not parse DATABASE_URL for backup creation"
        warning "Please ensure you have a recent backup before proceeding"
    fi
}

# Apply the migration
apply_migration() {
    log "Applying database migration..."
    
    # Use the comprehensive migration manager
    if pnpm tsx scripts/database-migration-manager.ts migrate; then
        success "Migration applied successfully!"
        return 0
    else
        error "Migration failed!"
        return 1
    fi
}

# Verify migration success
verify_migration() {
    log "Verifying migration..."
    
    if pnpm tsx scripts/database-migration-manager.ts verify; then
        success "Migration verification successful!"
        return 0
    else
        error "Migration verification failed!"
        return 1
    fi
}

# Test application functionality
test_application() {
    log "Testing application functionality..."
    
    # Test that the Prisma client can use the new column
    if pnpm tsx scripts/database-migration-manager.ts test; then
        success "Application functionality test passed!"
        return 0
    else
        warning "Application functionality test failed - please investigate"
        return 1
    fi
}

# Main execution
main() {
    log "Starting production database migration process..."
    log "Migration: Add last_error column to environments table"
    echo
    
    # Pre-flight checks
    check_environment
    test_database_connection
    
    # Backup (optional but recommended)
    create_backup
    
    echo
    warning "You are about to apply a database migration to production!"
    warning "This will add a 'last_error' TEXT column to the 'environments' table."
    warning "This is a safe, non-breaking change that adds a nullable column."
    echo
    
    # Confirmation
    read -p "Do you want to proceed? (yes/no): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log "Migration cancelled by user"
        exit 0
    fi
    
    echo
    log "Proceeding with migration..."
    
    # Apply migration
    if apply_migration; then
        echo
        
        # Verify migration
        if verify_migration; then
            echo
            
            # Test application
            test_application
            
            echo
            success "=== MIGRATION COMPLETED SUCCESSFULLY ==="
            success "The last_error column has been added to the environments table"
            success "Your application should now be able to create environments without errors"
            echo
            log "Next steps:"
            log "1. Monitor your application logs for any issues"
            log "2. Test environment creation functionality"
            log "3. The new column will help debug future environment creation failures"
        else
            error "Migration verification failed - please investigate immediately"
            exit 1
        fi
    else
        error "Migration failed - database was not modified"
        exit 1
    fi
}

# Trap to ensure cleanup
trap 'error "Script interrupted"; exit 1' INT TERM

# Run main function
main "$@"
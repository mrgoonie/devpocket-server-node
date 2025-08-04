#!/bin/bash

# DevPocket Test Environment Setup Script
# This script sets up the test database environment

set -e

echo "🧪 Setting up DevPocket Test Environment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[TEST-SETUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Stop any existing test containers
print_status "Stopping existing test containers..."
docker-compose -f docker-compose.test.yml down --remove-orphans > /dev/null 2>&1 || true

# Start test database
print_status "Starting test database..."
if docker-compose -f docker-compose.test.yml up -d postgres-test; then
    print_success "Test database started successfully!"
else
    print_error "Failed to start test database"
    exit 1
fi

# Wait for database to be ready
print_status "Waiting for database to be ready..."
timeout 30 bash -c 'until docker-compose -f docker-compose.test.yml exec postgres-test pg_isready -U devpocket -d devpocket_test; do sleep 1; done'

if [ $? -eq 0 ]; then
    print_success "Test database is ready!"
else
    print_error "Test database failed to start within 30 seconds"
    exit 1
fi

# Run database migrations
print_status "Running database migrations..."
if dotenv -e .env.test -- pnpm prisma migrate deploy; then
    print_success "Database migrations completed!"
else
    print_warning "Database migrations failed - this might be expected for first run"
fi

# Generate Prisma client
print_status "Generating Prisma client..."
if pnpm prisma generate; then
    print_success "Prisma client generated!"
else
    print_error "Failed to generate Prisma client"
    exit 1
fi

print_success "Test environment is ready!"
echo ""
print_status "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: devpocket_test"
echo "  Username: devpocket"
echo "  Password: devpocket_password"
echo ""
print_status "To run tests: pnpm test"
print_status "To stop test environment: docker-compose -f docker-compose.test.yml down"
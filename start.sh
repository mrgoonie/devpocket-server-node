#!/bin/bash

# DevPocket Server Startup Script
# This script sets up and starts the development environment

set -e

echo "🚀 Starting DevPocket Server Development Environment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# Check if .env file exists
if [ ! -f .env ]; then
    print_warning ".env file not found. Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        print_success ".env file created from .env.example"
        print_warning "Please update the .env file with your configuration before proceeding."
    else
        print_error ".env.example file not found. Please create a .env file manually."
        exit 1
    fi
fi

# Load environment variables
set -a
source .env
set +a

# Parse command line arguments
PROFILE=""
DETACHED=""
BUILD=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --with-tools)
            PROFILE="--profile dev-tools"
            print_status "Starting with development tools (Adminer, Redis Commander)"
            shift
            ;;
        --production-like)
            PROFILE="--profile production-like"
            print_status "Starting with production-like setup (Nginx)"
            shift
            ;;
        --detached|-d)
            DETACHED="-d"
            print_status "Starting in detached mode"
            shift
            ;;
        --build)
            BUILD="--build"
            print_status "Forcing rebuild of containers"
            shift
            ;;
        --help|-h)
            echo "DevPocket Server Startup Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --with-tools       Start with development tools (Adminer, Redis Commander)"
            echo "  --production-like  Start with production-like setup (Nginx)"
            echo "  --detached, -d     Start in detached mode"
            echo "  --build            Force rebuild of containers"
            echo "  --help, -h         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Start basic development environment"
            echo "  $0 --with-tools            # Start with database and Redis management tools"
            echo "  $0 --production-like -d    # Start production-like setup in background"
            echo "  $0 --build                 # Rebuild and start"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            print_status "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Create logs directory
mkdir -p logs/nginx

# Stop any existing containers
print_status "Stopping existing containers..."
docker-compose down --remove-orphans > /dev/null 2>&1 || true

# Start the development environment
print_status "Starting DevPocket development environment..."

# Build and start containers
COMMAND="docker-compose up $BUILD $DETACHED $PROFILE"
print_status "Running: $COMMAND"

if eval $COMMAND; then
    print_success "Development environment started successfully!"
    
    echo ""
    print_status "Available services:"
    echo "  🌐 API Server:          http://localhost:8000"
    echo "  📊 API Health:          http://localhost:8000/health"
    echo "  📚 API Documentation:   http://localhost:8000/api/v1/docs"
    
    if [[ $PROFILE == *"dev-tools"* ]]; then
        echo "  🗄️  Database Admin:      http://localhost:8080 (Adminer)"
        echo "  🔴 Redis Commander:     http://localhost:8081"
    fi
    
    if [[ $PROFILE == *"production-like"* ]]; then
        echo "  🔄 Load Balancer:       http://localhost:80"
    fi
    
    echo ""
    print_status "Database connection:"
    echo "  Host: localhost"
    echo "  Port: 5432"
    echo "  Database: devpocket_server"
    echo "  Username: devpocket"
    echo "  Password: devpocket_password"
    
    echo ""
    print_status "Redis connection:"
    echo "  Host: localhost"
    echo "  Port: 6379"
    echo "  Password: (none in development)"
    
    if [[ $DETACHED != "-d" ]]; then
        echo ""
        print_status "Press Ctrl+C to stop all services"
        print_warning "Logs will be displayed below. Use 'docker-compose logs -f <service>' for specific service logs."
    else
        echo ""
        print_status "Services are running in the background."
        print_status "Use 'docker-compose logs -f' to view logs"
        print_status "Use 'docker-compose down' to stop all services"
    fi
    
else
    print_error "Failed to start development environment"
    print_status "Check the error messages above and try again"
    exit 1
fi
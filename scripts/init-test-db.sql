-- Test Database Initialization Script
-- This script sets up the test database with minimal configuration

-- Create test database if it doesn't exist
SELECT 'CREATE DATABASE devpocket_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'devpocket_test');

-- Grant permissions to devpocket user
GRANT ALL PRIVILEGES ON DATABASE devpocket_test TO devpocket;

-- Set up test-specific configurations
ALTER DATABASE devpocket_test SET log_statement = 'none';
ALTER DATABASE devpocket_test SET log_duration = off;
ALTER DATABASE devpocket_test SET log_min_duration_statement = -1;
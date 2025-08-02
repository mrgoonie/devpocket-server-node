# DevPocket API - Comprehensive Reference

## Overview

This document provides a complete technical reference for the DevPocket API (v1). The API enables developers to manage development environments, user authentication, templates, and clusters programmatically.

**Base URLs**:
- Production: `https://devpocket-api.goon.vn`
- Development: `http://localhost:8000`

**OpenAPI Version**: 3.1.0  
**API Version**: 1.0.0  
**Last Updated**: 2025-07-31

## Table of Contents

1. [Authentication](#authentication)
2. [Health Check](#health-check)
3. [Authentication Endpoints](#authentication-endpoints)
4. [User Management](#user-management)
5. [Environment Management](#environment-management)
6. [Template Management](#template-management)
7. [Cluster Management](#cluster-management)
8. [WebSocket Endpoints](#websocket-endpoints)
9. [Data Models](#data-models)
10. [Error Handling](#error-handling)
11. [Rate Limiting & Security](#rate-limiting--security)

## Authentication

The API supports two authentication methods:

### JWT Bearer Token
Most endpoints require JWT authentication. Include the token in the Authorization header:
```http
Authorization: Bearer <your-jwt-token>
```

### Google OAuth
Available for authentication endpoints using Google Sign-In flow.

## Health Check

### GET /health
Check API health status.

**Authentication**: None required  
**Response**: 
```json
{
  "status": "healthy",
  "service": "DevPocket API",
  "version": "1.0.0",
  "environment": "production",
  "timestamp": 1722729600.0
}
```

### GET /health/ready
Kubernetes readiness check.

**Authentication**: None required  
**Response**: 
```json
{
  "status": "ready",
  "checks": {
    "database": "healthy"
  }
}
```

### GET /health/live
Kubernetes liveness check.

**Authentication**: None required  
**Response**: 
```json
{
  "status": "alive"
}
```

### GET /api/v1/info
Get API information and feature flags.

**Authentication**: None required  
**Response**: 
```json
{
  "name": "DevPocket API",
  "version": "1.0.0",
  "environment": "production",
  "features": {
    "authentication": true,
    "google_oauth": true,
    "websockets": true,
    "rate_limiting": true,
    "metrics": true
  },
  "limits": {
    "free_environments": 1,
    "starter_environments": 3,
    "pro_environments": 10
  }
}
```

## Authentication Endpoints

### POST /api/v1/auth/register
Register a new user account.

**Authentication**: None required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "username": "johndoe",
  "email": "user@example.com",
  "password": "securePassword123",
  "full_name": "John Doe"
}
```

**Response (201)**:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "johndoe",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_verified": false,
  "avatar_url": null,
  "subscription_plan": "free",
  "created_at": "2024-01-01T00:00:00Z",
  "last_login": null
}
```

**Important Notes**:
- A verification email is automatically sent to the user's email address
- The user account is created but `is_verified` is `false` until email verification
- Username must be unique and alphanumeric (with hyphens/underscores allowed)

**Error Responses**:
- `400`: Validation error (email/username already exists, weak password)
- `409`: Conflict (username or email already in use)
- `422`: Invalid request data
- `500`: Internal server error

### POST /api/v1/auth/login
Authenticate user with email and password.

**Authentication**: None required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "username_or_email": "johndoe",
  "password": "securePassword123"
}
```

**Response (200)**:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...", 
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "username": "johndoe",
    "email": "user@example.com",
    "full_name": "John Doe"
  }
}
```

**Error Responses**:
- `401`: Unauthorized (incorrect credentials)
- `403`: Forbidden (account locked due to failed attempts)
- `422`: Invalid request data
- `429`: Too many requests (rate limited)

### POST /api/v1/auth/google
Authenticate using Google OAuth.

**Authentication**: None required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "token": "google_oauth_token_here"
}
```

**Response (200)**: Same as login endpoint

### GET /api/v1/auth/me
Get current user information.

**Authentication**: Required (Bearer token)

**Response (200)**:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "username": "johndoe",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "is_verified": true,
  "avatar_url": null,
  "subscription_plan": "free",
  "created_at": "2024-01-01T00:00:00Z",
  "last_login": "2024-01-01T12:00:00Z"
}
```

### POST /api/v1/auth/logout
Logout user (invalidate tokens).

**Authentication**: Required (Bearer token)

**Response (200)**:
```json
{
  "message": "Successfully logged out"
}
```

### POST /api/v1/auth/refresh
Refresh JWT access token.

**Authentication**: Refresh token required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

**Response (200)**:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

### POST /api/v1/auth/verify-email
Verify user email address.

**Authentication**: None required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "token": "email_verification_token"
}
```

**Response (200)**:
```json
{
  "message": "Email verified successfully"
}
```

### POST /api/v1/auth/resend-verification
Resend email verification.

**Authentication**: Required (Bearer token)

**Response (200)**:
```json
{
  "message": "Verification email sent"
}
```

## Environment Management

### POST /api/v1/environments
Create a new development environment. **Returns immediately** with "creating" status while environment is provisioned asynchronously in the background.

**Authentication**: Required (Bearer token)  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "name": "my-python-env",
  "template": "python",
  "resources": {
    "cpu": "500m",
    "memory": "1Gi", 
    "storage": "10Gi"
  },
  "environment_variables": {
    "PYTHON_VERSION": "3.11"
  }
}
```

**Response (201)**:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "my-python-env",
  "description": null,
  "template_id": "507f1f77bcf86cd799439012",
  "template_name": "Python 3.11",
  "status": "creating",
  "docker_image": "python:3.11-slim",
  "port": 8080,
  "resources": {
    "cpu": "500m",
    "memory": "1Gi",
    "storage": "10Gi"  
  },
  "environment_variables": {
    "PYTHON_VERSION": "3.11"
  },
  "installation_completed": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "last_activity": null,
  "cpu_usage": 0.0,
  "memory_usage": 0.0,
  "storage_usage": 0.0,
  "external_url": null,
  "web_port": 8080
}
```

**Asynchronous Environment Creation Process**:

The environment creation follows a detailed status state machine:

1. **`creating`** - API responds immediately, environment queued for processing
2. **`provisioning`** - Kubernetes resources being created (PVC, Deployment, Service) 
3. **`installing`** - Container started, packages and dependencies being installed
4. **`configuring`** - Final configuration, environment variables, and startup scripts
5. **`running`** - Environment is fully ready for terminal access and development

**Additional Status States**:
- `stopped` - Environment is paused (can be restarted)
- `stopping` - Environment is being stopped
- `restarting` - Environment is being restarted  
- `error` - An error occurred during any phase
- `terminated` - Environment is permanently deleted

**Real-time Updates**:
To monitor environment creation progress, use WebSocket endpoints:
- **Terminal WebSocket**: `/api/v1/ws/terminal/{environment_id}?token=jwt_token`
- **Logs WebSocket**: `/api/v1/ws/logs/{environment_id}?token=jwt_token`

**Status Update Messages (via WebSocket)**:
```json
{
  "type": "status_update",
  "environment_id": "507f1f77bcf86cd799439011", 
  "status": "provisioning",
  "message": "Creating persistent volume claim...",
  "progress": 25,
  "timestamp": "2024-01-01T00:01:30Z"
}
```

**Typical Timeline**:
- **API Response**: Immediate (< 1 second)
- **Provisioning**: 30-90 seconds (Kubernetes resource creation)
- **Installation**: 1-15 minutes (depends on template complexity)
- **Total Time**: 2-20 minutes for full environment readiness

### GET /api/v1/environments
List user's development environments.

**Authentication**: Required (Bearer token)

**Query Parameters**:
- `status` (optional): Filter by status (`creating`, `installing`, `running`, `stopped`, `terminated`, `error`)
- `template_id` (optional): Filter by template ID

**Response (200)**:
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "name": "my-python-env",
    "description": "Python development environment",
    "template_id": "507f1f77bcf86cd799439012",
    "template_name": "Python 3.11",
    "status": "running",
    "docker_image": "python:3.11-slim",
    "port": 8080,
    "resources": {
      "cpu": "500m",
      "memory": "1Gi",
      "storage": "10Gi"
    },
    "environment_variables": {
      "PYTHON_VERSION": "3.11"
    },
    "installation_completed": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T06:00:00Z",
    "last_activity": "2024-01-01T12:00:00Z",
    "cpu_usage": 15.5,
    "memory_usage": 45.2,
    "storage_usage": 12.8,
    "external_url": "https://my-python-env-507f1f77.devpocket.app",
    "web_port": 8080
  }
]
```

### GET /api/v1/environments/{environment_id}
Get specific environment details.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**: Same as environment object above

**Error Responses**:
- `404`: Environment not found or access denied

### PUT /api/v1/environments/{environment_id}
Update an existing environment.

**Authentication**: Required (Bearer token)  
**Content-Type**: `application/json`

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Request Body**:
```json
{
  "name": "updated-python-env",
  "resources": {
    "cpu": "1000m",
    "memory": "2Gi",
    "storage": "20Gi"
  },
  "environment_variables": {
    "PYTHON_VERSION": "3.11",
    "DEBUG": "true"
  }
}
```

**Response (200)**: Updated environment object

### DELETE /api/v1/environments/{environment_id}
Delete an environment.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (204)**: No content

### POST /api/v1/environments/{environment_id}/start
Start a stopped environment.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**:
```json
{
  "message": "Environment started successfully",
  "status": "running"
}
```

**Requirements**: Environment must be in `stopped` state

### POST /api/v1/environments/{environment_id}/stop
Stop a running environment.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**:
```json
{
  "message": "Environment stopped successfully", 
  "status": "stopped"
}
```

**Requirements**: Environment must be in `running` state

### POST /api/v1/environments/{environment_id}/restart
Restart an environment.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**:
```json
{
  "message": "Environment restarted successfully",
  "status": "running"
}
```

### POST /api/v1/environments/{environment_id}/recover
Recover an environment from error state.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**:
```json
{
  "message": "Environment recovery initiated",
  "status": "creating"
}
```

### GET /api/v1/environments/{environment_id}/metrics
Get environment resource usage metrics.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Response (200)**:
```json
{
  "environment_id": "507f1f77bcf86cd799439011",
  "cpu_usage": 15.5,
  "memory_usage": 45.2,
  "storage_usage": 12.8,
  "network_rx": 1024,
  "network_tx": 2048,
  "uptime": 3600,
  "last_updated": "2024-01-01T12:00:00Z"
}
```

### GET /api/v1/environments/{environment_id}/logs
Get environment logs.

**Authentication**: Required (Bearer token)

**Path Parameters**:
- `environment_id`: Environment ID (ObjectId string)

**Query Parameters**:
- `lines` (optional): Number of log lines to retrieve (1-1000, default: 100)
- `since` (optional): Get logs since timestamp (ISO format)

**Response (200)**:
```json
{
  "environment_id": "507f1f77bcf86cd799439011",
  "environment_name": "my-python-env",
  "logs": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "level": "INFO",
      "message": "Application started successfully",
      "source": "container"
    },
    {
      "timestamp": "2024-01-01T12:01:00Z",
      "level": "DEBUG",
      "message": "Processing request",
      "source": "application"
    }
  ],
  "total_lines": 150,
  "has_more": true
}
```

## Template Management

Environment templates define pre-configured development environments with Docker images, resources, and startup commands.

### GET /api/v1/templates
List all available environment templates.

**Authentication**: Required (Bearer token)  
**Query Parameters**:
- `category` (optional): Filter by template category
  - `programming_language`: Python, Node.js, Go, etc.
  - `framework`: Django, React, Angular, etc.
  - `database`: PostgreSQL, MongoDB, Redis, etc.
  - `devops`: Docker, Kubernetes, CI/CD tools
  - `operating_system`: Ubuntu, Alpine, Debian, etc.
- `status` (optional): Filter by template status (`active`, `deprecated`, `beta`)

**Access Control**:
- All users can see `active` and `beta` templates
- Only admin users can see `deprecated` templates

**Response (200)**:
```json
[
  {
    "id": "507f1f77bcf86cd799439011",
    "name": "nodejs",
    "display_name": "Node.js 18 LTS",
    "description": "Node.js development environment with npm, yarn, and popular packages",
    "category": "programming_language",
    "tags": ["nodejs", "npm", "yarn", "express", "react"],
    "docker_image": "node:18-slim",
    "default_port": 3000,
    "default_resources": {
      "cpu": "500m",
      "memory": "1Gi",
      "storage": "10Gi"
    },
    "environment_variables": {
      "NODE_ENV": "development"
    },
    "startup_commands": [
      "npm install -g nodemon typescript"
    ],
    "documentation_url": "https://nodejs.org/en/docs/",
    "icon_url": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg",
    "status": "active",
    "version": "1.0.0",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "usage_count": 123
  }
]
```

**Error Responses**:
- `401`: Unauthorized - Invalid or missing token
- `500`: Internal server error

### GET /api/v1/templates/{template_id}
Get detailed information about a specific template.

**Authentication**: Required (Bearer token)  
**Path Parameters**:
- `template_id`: Template ID (24-character MongoDB ObjectId)

**Access Control**:
- All users can access `active` and `beta` templates
- Only admin users (pro/admin subscription) can access `deprecated` templates

**Response (200)**: Same as template object above

**Error Responses**:
- `401`: Unauthorized - Invalid or missing token
- `404`: Template not found
- `500`: Internal server error

### POST /api/v1/templates
Create a new environment template.

**Authentication**: Required (Bearer token + Admin role)  
**Content-Type**: `application/json`

**Requirements**:
- Admin access required
- Template name must be unique
- Valid Docker image must be specified

**Request Body**:
```json
{
  "name": "java",
  "display_name": "Java 17 LTS",
  "description": "Java development environment with Maven and Gradle support",
  "category": "programming_language",
  "tags": ["java", "jvm", "maven", "gradle", "spring"],
  "docker_image": "openjdk:17-slim",
  "default_port": 8080,
  "default_resources": {
    "cpu": "1000m",
    "memory": "2Gi", 
    "storage": "15Gi"
  },
  "environment_variables": {
    "JAVA_HOME": "/usr/local/openjdk-17",
    "MAVEN_HOME": "/usr/share/maven"
  },
  "startup_commands": [
    "apt-get update && apt-get install -y maven gradle",
    "mkdir -p /workspace"
  ],
  "documentation_url": "https://docs.oracle.com/en/java/",
  "icon_url": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg"
}
```

**Response (201)**:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "ruby",
  "display_name": "Ruby 3.2",
  "description": "Ruby development environment with bundler and Rails support",
  "category": "programming_language",
  "tags": ["ruby", "rails", "bundler"],
  "docker_image": "ruby:3.2-slim",
  "default_port": 3000,
  "default_resources": {
    "cpu": "500m",
    "memory": "1Gi",
    "storage": "10Gi"
  },
  "environment_variables": {
    "RAILS_ENV": "development"
  },
  "startup_commands": [
    "gem install bundler rails"
  ],
  "documentation_url": "https://www.ruby-lang.org/en/documentation/",
  "icon_url": "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/ruby/ruby-original.svg",
  "status": "active",
  "version": "1.0.0",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "usage_count": 0
}
```

**Error Responses**:
- `400`: Bad request - Template name already exists
- `401`: Unauthorized - Invalid or missing token
- `403`: Forbidden - Admin access required
- `500`: Internal server error

### PUT /api/v1/templates/{template_id}
Update an existing template.

**Authentication**: Required (Bearer token + Admin role)  
**Content-Type**: `application/json`  
**Path Parameters**:
- `template_id`: Template ID to update (24-character MongoDB ObjectId)

**Requirements**:
- Admin access required
- Only provided fields will be updated
- Cannot change template name once created

**Request Body**:
```json
{
  "description": "Updated Java development environment with Spring Boot support",
  "tags": ["java", "spring-boot", "microservices"],
  "environment_variables": {
    "JAVA_HOME": "/usr/local/openjdk-17",
    "SPRING_PROFILES_ACTIVE": "dev"
  },
  "status": "active"
}
```

**Response (200)**: Updated template object

**Error Responses**:
- `401`: Unauthorized - Invalid or missing token
- `403`: Forbidden - Admin access required
- `404`: Template not found
- `500`: Internal server error

### DELETE /api/v1/templates/{template_id}
Delete a template (soft delete).

**Authentication**: Required (Bearer token + Admin role)  
**Path Parameters**:
- `template_id`: Template ID to delete (24-character MongoDB ObjectId)

**Important**:
- Templates are not physically deleted
- Status is set to 'deprecated'
- Deprecated templates are hidden from non-admin users
- Existing environments using this template will continue to work

**Response (200)**:
```json
{
  "message": "Template deleted successfully"
}
```

**Error Responses**:
- `401`: Unauthorized - Invalid or missing token
- `403`: Forbidden - Admin access required
- `404`: Template not found
- `500`: Internal server error

### POST /api/v1/templates/initialize
Initialize the system with default templates.

**Authentication**: Required (Bearer token + Admin role)

**Default Templates**:
- Python 3.11 with Flask/Django support
- Node.js 18 LTS with npm/yarn
- Go 1.21 with development tools
- Rust Latest with cargo
- Ubuntu 22.04 LTS base environment

**Note**: Existing templates with the same names will be skipped

**Response (200)**:
```json
{
  "message": "Default templates initialized successfully"
}
```

**Error Responses**:
- `401`: Unauthorized - Invalid or missing token
- `403`: Forbidden - Admin access required
- `500`: Internal server error

## Cluster Management

### POST /api/v1/clusters
Create a new Kubernetes cluster (Admin only).

**Authentication**: Required (Bearer token + Admin role)  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "name": "production-cluster",
  "description": "Production Kubernetes cluster",
  "provider": "ovh",
  "region": "GRA7",
  "kubeconfig": "base64_encoded_kubeconfig_content"
}
```

**Response (201)**:
```json
{
  "id": "507f1f77bcf86cd799439013",
  "name": "production-cluster",
  "description": "Production Kubernetes cluster",
  "provider": "ovh",
  "region": "GRA7",
  "kubeconfig": "[ENCRYPTED]",
  "status": "active",
  "node_count": 3,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### GET /api/v1/clusters
List all clusters (Admin only).

**Authentication**: Required (Bearer token + Admin role)

**Response (200)**:
```json
[
  {
    "id": "507f1f77bcf86cd799439013",
    "name": "production-cluster",
    "description": "Production Kubernetes cluster",
    "provider": "ovh",
    "region": "GRA7",
    "kubeconfig": "[ENCRYPTED]",
    "status": "active",
    "node_count": 3,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

### GET /api/v1/clusters/regions
Get available regions for cluster deployment (Admin only).

**Authentication**: Required (Bearer token + Admin role)

**Response (200)**:
```json
[
  {
    "name": "GRA7",
    "display_name": "Gravelines 7",  
    "country": "France",
    "provider": "ovh"
  },
  {
    "name": "SBG5", 
    "display_name": "Strasbourg 5",
    "country": "France",
    "provider": "ovh"
  }
]
```

### GET /api/v1/clusters/{cluster_id}/health
Check cluster health status (Admin only).

**Authentication**: Required (Bearer token + Admin role)

**Path Parameters**:
- `cluster_id`: Cluster ID (ObjectId string)

**Response (200)**:
```json
{
  "cluster_id": "507f1f77bcf86cd799439013",
  "status": "healthy",
  "nodes": 3,
  "ready_nodes": 3,
  "cpu_usage": 45.2,
  "memory_usage": 67.8,
  "storage_usage": 23.1,
  "last_check": "2024-01-01T12:00:00Z"
}
```

## WebSocket Endpoints

### WebSocket /api/v1/ws/terminal/{environment_id}
Real-time terminal access to development environment.

**Authentication**: JWT token via query parameter `?token=jwt_token`

**Connection URL**: 
```
wss://devpocket-api.goon.vn/api/v1/ws/terminal/507f1f77bcf86cd799439011?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

**Message Types**:

#### Client → Server Messages

**Terminal Input**:
```json
{
  "type": "input",
  "data": "ls -la\r"
}
```

**Terminal Resize**:
```json
{
  "type": "resize", 
  "cols": 80,
  "rows": 24
}
```

**Ping (Keepalive)**:
```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**Welcome Message**:
```json
{
  "type": "welcome",
  "message": "Connected to my-python-env",
  "environment": {
    "id": "507f1f77bcf86cd799439011",
    "name": "my-python-env",
    "template": "python",
    "status": "running",
    "installation_completed": true,
    "pty_enabled": true
  }
}
```

**Terminal Output** (includes ANSI escape sequences):
```json
{
  "type": "output",
  "data": "\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b[01;32mdevpocket@my-python-env\u001b[00m:\u001b[01;34m/workspace\u001b[00m$ ls -la\r\ntotal 8\r\ndrwxr-xr-x 2 devpocket devpocket 4096 Jan 01 12:00 .\r\ndrwxr-xr-x 3 devpocket devpocket 4096 Jan 01 12:00 ..\r\n"
}
```

**Error Message**:
```json
{
  "type": "error",
  "message": "Failed to send input to terminal"
}
```

**Environment Status Update** (during environment creation):
```json
{
  "type": "status_update",
  "environment_id": "507f1f77bcf86cd799439011",
  "status": "provisioning",
  "message": "Creating persistent volume claim...",
  "progress": 25,
  "timestamp": "2024-01-01T00:01:30Z"
}
```

**Pong Response** (reply to ping):
```json
{
  "type": "pong"
}
```

**Info Message**:
```json
{
  "type": "info",
  "message": "Environment is still installing. Terminal will be available once installation completes."
}
```

**Pong Response**:
```json
{
  "type": "pong"
}
```

**Rate Limit Warning**:
```json
{
  "type": "error",
  "message": "Rate limit exceeded. Please slow down."
}
```

### WebSocket /api/v1/ws/logs/{environment_id}
Real-time log streaming from environment.

**Authentication**: JWT token via query parameter `?token=jwt_token`

**Connection URL**:
```
wss://devpocket-api.goon.vn/api/v1/ws/logs/507f1f77bcf86cd799439011?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

**Message Types**:

#### Client → Server Messages

**Ping (Keepalive)**:
```json
{
  "type": "ping"
}
```

#### Server → Client Messages

**Welcome Message**:
```json
{
  "type": "welcome",
  "message": "Connected to my-python-env logs"
}
```

**Installation Log** (during environment setup):
```json
{
  "type": "installation_log",
  "environment_id": "507f1f77bcf86cd799439011",
  "data": "Get:1 http://archive.ubuntu.com/ubuntu jammy InRelease [270 kB]\n",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

**Installation Complete**:
```json
{
  "type": "installation_complete",
  "environment_id": "507f1f77bcf86cd799439011",
  "status": "running"
}
```

**Installation Status**:
```json
{
  "type": "installation_status",
  "environment_id": "507f1f77bcf86cd799439011", 
  "status": "installing",
  "message": "Installing system dependencies..."
}
```

**Installation Error**:
```json
{
  "type": "installation_error",
  "environment_id": "507f1f77bcf86cd799439011",
  "error": "Failed to install package: connection timeout"
}
```

**Container Log**:
```json
{
  "type": "log",
  "timestamp": "2024-01-01T12:00:00Z",
  "level": "INFO",
  "message": "Application started on port 8080",
  "source": "container"
}
```

**Connection Limits**:
- Maximum 10 concurrent WebSocket connections per user
- Message rate limit: 100 messages per minute per connection
- Connection timeout: 30 seconds for authentication
- Ping interval: 30 seconds (client should send ping to maintain connection)

**Error Codes**:
- `1008`: Authentication failed / Token invalid / Too many connections / Environment not found
- `1000`: Normal closure

## Data Models

**User Model**:
```json
{
  "id": "string (ObjectId)",
  "username": "string",
  "email": "string",
  "full_name": "string",
  "is_active": "boolean",
  "is_verified": "boolean",
  "avatar_url": "string",
  "subscription_plan": "string (free|starter|pro)",
  "created_at": "string (ISO datetime)",
  "last_login": "string (ISO datetime)"
}
```

**Environment Model**:
```json
{
  "id": "string (ObjectId)",
  "name": "string",
  "description": "string",
  "template_id": "string (ObjectId)",
  "template_name": "string",
  "status": "string (creating|installing|running|stopped|terminated|error)",
  "docker_image": "string",
  "port": "integer",
  "resources": {
    "cpu": "string",
    "memory": "string", 
    "storage": "string"
  },
  "environment_variables": "object",
  "installation_completed": "boolean",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)",
  "last_activity": "string (ISO datetime)",
  "cpu_usage": "number",
  "memory_usage": "number",
  "storage_usage": "number",
  "external_url": "string",
  "web_port": "integer"
}
```

**Template Model**:
```json
{
  "id": "string (ObjectId)",
  "name": "string", 
  "display_name": "string",
  "description": "string",
  "category": "string (programming_language|framework|database|devops|operating_system)",
  "tags": "array of strings",
  "docker_image": "string",
  "default_port": "integer", 
  "default_resources": {
    "cpu": "string",
    "memory": "string",
    "storage": "string"
  },
  "environment_variables": "object",
  "startup_commands": "array of strings",
  "documentation_url": "string",
  "icon_url": "string",
  "status": "string (active|deprecated|beta)",
  "version": "string",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)",
  "usage_count": "integer"
}
```

**Cluster Model**:
```json
{
  "id": "string (ObjectId)",
  "name": "string",
  "description": "string", 
  "provider": "string",
  "region": "string",
  "kubeconfig": "string (encrypted)",
  "status": "string (active|inactive|maintenance)",
  "node_count": "integer",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)"
}
```

## Error Handling

All endpoints return structured error responses:

```json
{
  "detail": "Error message",
  "errors": []
}
```

**Common HTTP Status Codes**:
- `200`: Success
- `201`: Created  
- `204`: No Content
- `400`: Bad Request
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (resource already exists)
- `422`: Unprocessable Entity (validation error)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error
- `503`: Service Unavailable

## Rate Limiting & Security

**API Rate Limits**:
- Authentication endpoints: 5 requests per minute
- General API endpoints: 100 requests per minute  
- WebSocket connections: 10 connections per user
- WebSocket messages: 100 messages per minute per connection

**Rate Limit Headers**:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when rate limit resets

**Security Headers**:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

**JWT Token Structure**:
```json
{
  "sub": "user_id",
  "username": "johndoe",
  "email": "user@example.com",
  "exp": 1640995200,
  "iat": 1640991600,
  "type": "access_token"
}
```

**Account Security**:
- Account lockout after 5 failed login attempts
- Password strength validation enforced
- Email verification required for new accounts
- Session timeout after inactivity period
- `422`: Invalid request data

### POST /api/v1/auth/google
Authenticate user with Google OAuth token.

**Authentication**: None required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "token": "google_oauth_token_here"
}
```

**Response (200)**:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@gmail.com",
    "full_name": "John Doe",
    "is_verified": true,
    "created_at": "2024-07-24T00:00:00Z",
    "updated_at": "2024-07-24T00:00:00Z"
  }
}
```

**Error Responses**:
- `400`: Invalid Google token
- `422`: Invalid request data

### POST /api/v1/auth/logout
Logout user and invalidate tokens.

**Authentication**: Bearer token required

**Response (200)**:
```json
{
  "message": "Successfully logged out"
}
```

### GET /api/v1/auth/me
Get current user information.

**Authentication**: Bearer token required

**Response (200)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_verified": true,
  "created_at": "2024-07-24T00:00:00Z",
  "updated_at": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `401`: Invalid or expired token

### POST /api/v1/auth/verify-email
Send email verification link.

**Authentication**: Bearer token required

**Response (200)**:
```json
{
  "message": "Verification email sent"
}
```

## User Management

### PUT /api/v1/users/me
Update current user profile.

**Authentication**: Bearer token required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "full_name": "John Updated Doe",
  "email": "updated@example.com"
}
```

**Response (200)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "updated@example.com",
  "full_name": "John Updated Doe",
  "is_verified": true,
  "created_at": "2024-07-24T00:00:00Z",
  "updated_at": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `400`: Email already exists
- `401`: Unauthorized
- `422`: Invalid request data

### DELETE /api/v1/users/me
Delete current user account.

**Authentication**: Bearer token required

**Response (200)**:
```json
{
  "message": "User account deleted successfully"
}
```

**Error Responses**:
- `401`: Unauthorized

## Environment Management

### GET /api/v1/environments
List all user environments.

**Authentication**: Bearer token required

**Query Parameters**:
- `status` (optional): Filter by status (`creating`, `running`, `stopped`, `error`, `deleting`)
- `template_id` (optional): Filter by template ID
- `limit` (optional, default: 50): Number of environments to return
- `offset` (optional, default: 0): Number of environments to skip

**Response (200)**:
```json
{
  "environments": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "my-python-env",
      "status": "running",
      "template_id": "python-3.11",
      "cluster_id": "default-cluster",
      "resources": {
        "cpu": "500m",
        "memory": "1Gi",
        "storage": "10Gi"
      },
      "port": 8080,
      "url": "https://my-python-env.devpocket-api.goon.vn",
      "created_at": "2024-07-24T00:00:00Z",
      "updated_at": "2024-07-24T00:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### POST /api/v1/environments
Create a new environment.

**Authentication**: Bearer token required  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "name": "my-new-environment",
  "template_id": "python-3.11",
  "cluster_id": "default-cluster",
  "resources": {
    "cpu": "1000m",
    "memory": "2Gi",
    "storage": "20Gi"
  },
  "environment_variables": {
    "DEBUG": "true",
    "DATABASE_URL": "postgresql://..."
  }
}
```

**Response (201)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-new-environment",
  "status": "creating",
  "template_id": "python-3.11",
  "cluster_id": "default-cluster",
  "resources": {
    "cpu": "1000m",
    "memory": "2Gi",
    "storage": "20Gi"
  },
  "port": 8080,
  "url": null,
  "environment_variables": {
    "DEBUG": "true",
    "DATABASE_URL": "postgresql://..."
  },
  "created_at": "2024-07-24T00:00:00Z",
  "updated_at": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `400`: Invalid template or cluster ID
- `401`: Unauthorized
- `422`: Invalid request data

### GET /api/v1/environments/{environment_id}
Get specific environment details.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Response (200)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "my-python-env",
  "status": "running",
  "template_id": "python-3.11",
  "cluster_id": "default-cluster",
  "resources": {
    "cpu": "500m",
    "memory": "1Gi",
    "storage": "10Gi"
  },
  "port": 8080,
  "url": "https://my-python-env.devpocket-api.goon.vn",
  "environment_variables": {
    "DEBUG": "true"
  },
  "created_at": "2024-07-24T00:00:00Z",
  "updated_at": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Environment not found

### PUT /api/v1/environments/{environment_id}
Update an existing environment.

**Authentication**: Bearer token required  
**Content-Type**: `application/json`

**Path Parameters**:
- `environment_id`: UUID of the environment

**Request Body**:
```json
{
  "name": "updated-environment-name",
  "resources": {
    "cpu": "1000m",
    "memory": "2Gi",
    "storage": "20Gi"
  },
  "environment_variables": {
    "DEBUG": "false",
    "NEW_VAR": "value"
  }
}
```

**Response (200)**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "updated-environment-name",
  "status": "running",
  "template_id": "python-3.11",
  "cluster_id": "default-cluster",
  "resources": {
    "cpu": "1000m",
    "memory": "2Gi",
    "storage": "20Gi"
  },
  "port": 8080,
  "url": "https://updated-environment-name.devpocket-api.goon.vn",
  "environment_variables": {
    "DEBUG": "false",
    "NEW_VAR": "value"
  },
  "created_at": "2024-07-24T00:00:00Z",
  "updated_at": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Environment not found
- `422`: Invalid request data

### DELETE /api/v1/environments/{environment_id}
Delete an environment.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Response (200)**:
```json
{
  "message": "Environment deleted successfully"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Environment not found

### POST /api/v1/environments/{environment_id}/start
Start a stopped environment.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Response (200)**:
```json
{
  "message": "Environment start initiated",
  "status": "creating"
}
```

**Error Responses**:
- `400`: Environment cannot be started (invalid state)
- `401`: Unauthorized
- `404`: Environment not found

### POST /api/v1/environments/{environment_id}/stop
Stop a running environment.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Response (200)**:
```json
{
  "message": "Environment stop initiated",
  "status": "stopping"
}
```

**Error Responses**:
- `400`: Environment cannot be stopped (invalid state)
- `401`: Unauthorized
- `404`: Environment not found

### POST /api/v1/environments/{environment_id}/restart
Restart an environment.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Response (200)**:
```json
{
  "message": "Environment restart initiated",
  "status": "restarting"
}
```

**Error Responses**:
- `400`: Environment cannot be restarted (invalid state)
- `401`: Unauthorized
- `404`: Environment not found

### GET /api/v1/environments/{environment_id}/logs
Get environment logs.

**Authentication**: Bearer token required

**Path Parameters**:
- `environment_id`: UUID of the environment

**Query Parameters**:
- `lines` (optional, default: 100): Number of log lines (1-1000)
- `since` (optional): Get logs since timestamp (ISO format)
- `follow` (optional, default: false): Stream logs in real-time

**Response (200)**:
```json
{
  "environment_id": "550e8400-e29b-41d4-a716-446655440000",
  "environment_name": "my-python-env",
  "logs": [
    {
      "timestamp": "2024-07-24T00:00:00Z",
      "level": "INFO",
      "message": "Application started successfully",
      "source": "container"
    },
    {
      "timestamp": "2024-07-24T00:01:00Z",
      "level": "INFO",
      "message": "Server listening on port 8080",
      "source": "application"
    }
  ],
  "total_lines": 150,
  "has_more": true
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Environment not found

## Template Management

### GET /api/v1/templates
List all available templates.

**Authentication**: Bearer token required

**Query Parameters**:
- `category` (optional): Filter by category (`programming_language`, `framework`, `database`, `devops`, `operating_system`)
- `status` (optional): Filter by status (`active`, `deprecated`, `beta`)
- `limit` (optional, default: 50): Number of templates to return
- `offset` (optional, default: 0): Number of templates to skip

**Response (200)**:
```json
{
  "templates": [
    {
      "id": "python-3.11",
      "name": "python-3.11",
      "display_name": "Python 3.11",
      "description": "Python 3.11 development environment with pip and common packages",
      "category": "programming_language",
      "tags": ["python", "web", "data-science"],
      "docker_image": "python:3.11-slim",
      "default_port": 8080,
      "default_resources": {
        "cpu": "500m",
        "memory": "1Gi",
        "storage": "10Gi"
      },
      "environment_variables": {
        "PYTHONPATH": "/app",
        "PYTHONUNBUFFERED": "1"
      },
      "startup_commands": [
        "pip install --upgrade pip",
        "pip install flask fastapi"
      ],
      "documentation_url": "https://docs.python.org/3.11/",
      "icon_url": "https://www.python.org/static/img/python-logo.png",
      "status": "active",
      "version": "1.0.0",
      "created_at": "2024-07-24T00:00:00Z",
      "updated_at": "2024-07-24T00:00:00Z",
      "usage_count": 150
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### GET /api/v1/templates/{template_id}
Get specific template details.

**Authentication**: Bearer token required

**Path Parameters**:
- `template_id`: ID of the template

**Response (200)**: Same as individual template object above

**Error Responses**:
- `401`: Unauthorized
- `404`: Template not found

### POST /api/v1/templates
Create a new template (Admin only).

**Authentication**: Bearer token required (Admin role)  
**Content-Type**: `application/json`

**Request Body**:
```json
{
  "id": "nodejs-18",
  "name": "nodejs-18",
  "display_name": "Node.js 18 LTS",
  "description": "Node.js 18 LTS with npm and yarn",
  "category": "programming_language",
  "tags": ["nodejs", "javascript", "web"],
  "docker_image": "node:18-slim",
  "default_port": 3000,
  "default_resources": {
    "cpu": "500m",
    "memory": "1Gi",
    "storage": "10Gi"
  },
  "environment_variables": {
    "NODE_ENV": "development"
  },
  "startup_commands": [
    "npm install -g yarn",
    "npm install"
  ],
  "documentation_url": "https://nodejs.org/docs/",
  "icon_url": "https://nodejs.org/static/images/logo.svg",
  "status": "active",
  "version": "1.0.0"
}
```

**Response (201)**: Created template object

**Error Responses**:
- `401`: Unauthorized
- `403`: Forbidden (Admin required)
- `409`: Template ID already exists
- `422`: Invalid request data

### PUT /api/v1/templates/{template_id}
Update an existing template (Admin only).

**Authentication**: Bearer token required (Admin role)  
**Content-Type**: `application/json`

**Path Parameters**:
- `template_id`: ID of the template

**Request Body**: Same as POST with updated fields

**Response (200)**: Updated template object

**Error Responses**:
- `401`: Unauthorized
- `403`: Forbidden (Admin required)
- `404`: Template not found
- `422`: Invalid request data

### DELETE /api/v1/templates/{template_id}
Delete a template (Admin only) - Sets status to deprecated.

**Authentication**: Bearer token required (Admin role)

**Path Parameters**:
- `template_id`: ID of the template

**Response (200)**:
```json
{
  "message": "Template deprecated successfully"
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Forbidden (Admin required)
- `404`: Template not found

### POST /api/v1/templates/initialize
Initialize default templates (Admin only).

**Authentication**: Bearer token required (Admin role)

**Response (200)**:
```json
{
  "message": "Default templates initialized",
  "templates_created": 5
}
```

**Error Responses**:
- `401`: Unauthorized
- `403`: Forbidden (Admin required)

## Cluster Management

### GET /api/v1/clusters
List all available clusters.

**Authentication**: Bearer token required

**Response (200)**:
```json
{
  "clusters": [
    {
      "id": "default-cluster",
      "name": "Default Cluster",
      "description": "Primary development cluster",
      "region": "us-east-1",
      "status": "healthy",
      "capacity": {
        "total_cpu": "100000m",
        "used_cpu": "25000m",
        "total_memory": "200Gi",
        "used_memory": "50Gi",
        "total_storage": "1000Gi",
        "used_storage": "250Gi"
      },
      "node_count": 5,
      "created_at": "2024-07-24T00:00:00Z",
      "updated_at": "2024-07-24T00:00:00Z"
    }
  ]
}
```

### GET /api/v1/clusters/{cluster_id}
Get specific cluster details.

**Authentication**: Bearer token required

**Path Parameters**:
- `cluster_id`: ID of the cluster

**Response (200)**: Same as individual cluster object above

**Error Responses**:
- `401`: Unauthorized
- `404`: Cluster not found

### GET /api/v1/clusters/{cluster_id}/health
Get cluster health status.

**Authentication**: Bearer token required

**Path Parameters**:
- `cluster_id`: ID of the cluster

**Response (200)**:
```json
{
  "cluster_id": "default-cluster",
  "status": "healthy",
  "components": [
    {
      "name": "api-server",
      "status": "healthy",
      "message": "API server is responsive"
    },
    {
      "name": "node-pool",
      "status": "healthy",
      "message": "All nodes are ready"
    },
    {
      "name": "storage",
      "status": "healthy",
      "message": "Storage is available"
    }
  ],
  "last_checked": "2024-07-24T00:00:00Z"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Cluster not found

## WebSocket Endpoints

### WSS /api/v1/ws/terminal/{environment_id}
Establish WebSocket connection for terminal access.

**Authentication**: JWT token via query parameter or WebSocket headers
- Query parameter: `?token=<jwt_token>`
- WebSocket header: `Authorization: Bearer <jwt_token>`

**Path Parameters**:
- `environment_id`: UUID of the environment

**Connection Flow**:
1. Client establishes WebSocket connection
2. Server validates authentication
3. Server connects to environment terminal
4. Bidirectional terminal I/O through WebSocket

**Message Format**:
```json
{
  "type": "input|output|resize|error",
  "data": "terminal data or command",
  "metadata": {
    "timestamp": "2024-07-24T00:00:00Z",
    "rows": 24,
    "cols": 80
  }
}
```

**Message Types**:
- `input`: Client sending terminal input
- `output`: Server sending terminal output
- `resize`: Terminal resize event
- `error`: Error messages

**Example Messages**:
```json
// Client input
{
  "type": "input",
  "data": "ls -la\n"
}

// Server output
{
  "type": "output",
  "data": "total 8\ndrwxr-xr-x 2 user user 4096 Jul 24 00:00 .\ndrwxr-xr-x 3 user user 4096 Jul 24 00:00 ..\n"
}

// Terminal resize
{
  "type": "resize",
  "data": "",
  "metadata": {
    "rows": 30,
    "cols": 120
  }
}
```

**Error Responses**:
- `401`: Invalid or missing JWT token
- `404`: Environment not found
- `403`: Environment not accessible by user
- `503`: Terminal service unavailable

## Data Models

### User
```json
{
  "id": "string (UUID)",
  "email": "string",
  "full_name": "string",
  "is_verified": "boolean",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)"
}
```

### Environment
```json
{
  "id": "string (UUID)",
  "name": "string",
  "status": "string (creating|running|stopped|error|deleting)",
  "template_id": "string",
  "cluster_id": "string",
  "resources": {
    "cpu": "string (e.g., '500m')",
    "memory": "string (e.g., '1Gi')",
    "storage": "string (e.g., '10Gi')"
  },
  "port": "integer",
  "url": "string|null",
  "environment_variables": "object",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)"
}
```

### Template
```json
{
  "id": "string",
  "name": "string",
  "display_name": "string",
  "description": "string",
  "category": "string (programming_language|framework|database|devops|operating_system)",
  "tags": "array[string]",
  "docker_image": "string",
  "default_port": "integer",
  "default_resources": {
    "cpu": "string",
    "memory": "string",
    "storage": "string"
  },
  "environment_variables": "object",
  "startup_commands": "array[string]",
  "documentation_url": "string",
  "icon_url": "string",
  "status": "string (active|deprecated|beta)",
  "version": "string",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)",
  "usage_count": "integer"
}
```

### Cluster
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "region": "string",
  "status": "string (healthy|degraded|unhealthy)",
  "capacity": {
    "total_cpu": "string",
    "used_cpu": "string",
    "total_memory": "string",
    "used_memory": "string",
    "total_storage": "string",
    "used_storage": "string"
  },
  "node_count": "integer",
  "created_at": "string (ISO datetime)",
  "updated_at": "string (ISO datetime)"
}
```

### Authentication Response
```json
{
  "access_token": "string (JWT)",
  "refresh_token": "string (JWT)",
  "token_type": "string (bearer)",
  "expires_in": "integer (seconds)",
  "user": "User object"
}
```

### Log Entry
```json
{
  "timestamp": "string (ISO datetime)",
  "level": "string (DEBUG|INFO|WARN|ERROR)",
  "message": "string",
  "source": "string (container|application|system)"
}
```

## Error Handling

### Standard Error Response
All endpoints return structured error responses with consistent format:

```json
{
  "detail": "Human-readable error message",
  "errors": [
    {
      "field": "field_name",
      "message": "Field-specific error message",
      "code": "validation_code"
    }
  ],
  "timestamp": "2024-07-24T00:00:00Z",
  "path": "/api/v1/endpoint"
}
```

### HTTP Status Codes

| Code | Description | Usage |
|------|-------------|-------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Invalid request data, business logic errors |
| 401 | Unauthorized | Missing, invalid, or expired authentication |
| 403 | Forbidden | Insufficient permissions (admin required) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists (duplicate IDs) |
| 422 | Unprocessable Entity | Request validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Common Error Scenarios

#### Authentication Errors
```json
{
  "detail": "Invalid or expired token",
  "errors": [],
  "timestamp": "2024-07-24T00:00:00Z",
  "path": "/api/v1/environments"
}
```

#### Validation Errors
```json
{
  "detail": "Request validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_format"
    },
    {
      "field": "password",
      "message": "Password must be at least 8 characters",
      "code": "min_length"
    }
  ],
  "timestamp": "2024-07-24T00:00:00Z",
  "path": "/api/v1/auth/register"
}
```

#### Resource Not Found
```json
{
  "detail": "Environment not found",
  "errors": [],
  "timestamp": "2024-07-24T00:00:00Z",
  "path": "/api/v1/environments/550e8400-e29b-41d4-a716-446655440000"
}
```

#### Business Logic Errors
```json
{
  "detail": "Cannot start environment in current state",
  "errors": [
    {
      "field": "status",
      "message": "Environment must be stopped to start",
      "code": "invalid_state"
    }
  ],
  "timestamp": "2024-07-24T00:00:00Z",
  "path": "/api/v1/environments/550e8400-e29b-41d4-a716-446655440000/start"
}
```

## Rate Limiting & Security

### Rate Limiting
API implements rate limiting to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **General API endpoints**: 100 requests per minute per user
- **WebSocket connections**: 10 concurrent connections per user

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1690200000
```

When rate limit is exceeded:
```json
{
  "detail": "Rate limit exceeded. Try again later.",
  "errors": [],
  "timestamp": "2024-07-24T00:00:00Z",
  "retry_after": 60
}
```

### Security Considerations

#### JWT Tokens
- **Access tokens**: 1 hour expiry
- **Refresh tokens**: 7 days expiry
- Tokens are signed with HS256 algorithm
- Include user ID and permissions in payload

#### HTTPS Only
- All API endpoints require HTTPS
- WebSocket connections use WSS (WebSocket Secure)
- HTTP requests are redirected to HTTPS

#### CORS Policy
- CORS enabled for web applications
- Allowed origins configurable per environment
- Credentials included in CORS requests

#### Input Validation
- All inputs validated using Pydantic models
- SQL injection prevention through parameterized queries
- XSS prevention through input sanitization
- File upload restrictions (size, type, content)

#### Environment Isolation
- Each environment runs in isolated containers
- Network policies restrict inter-environment communication
- Resource quotas prevent resource exhaustion
- Automatic cleanup of unused environments

#### Audit Logging
- All API requests logged with user context
- Environment actions tracked for compliance
- Authentication events monitored
- Failed requests analyzed for security patterns

### Best Practices for Integration

#### Authentication
1. Store JWT tokens securely (secure storage on mobile, httpOnly cookies on web)
2. Implement automatic token refresh logic
3. Handle token expiry gracefully
4. Use HTTPS for all requests

#### Error Handling
1. Parse error responses consistently
2. Display user-friendly error messages
3. Implement retry logic for transient errors
4. Log errors for debugging

#### WebSocket Connections
1. Implement connection retry with exponential backoff
2. Handle connection drops gracefully
3. Validate all incoming messages
4. Implement ping/pong for connection health

#### Performance
1. Implement request caching where appropriate
2. Use pagination for large datasets
3. Optimize WebSocket message frequency
4. Implement request deduplication

This comprehensive reference provides all the information needed to integrate with the DevPocket API effectively. For additional support or questions, please refer to the official documentation or contact the development team.
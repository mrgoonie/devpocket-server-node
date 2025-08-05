# Multi-Environment Deployment Guide

This document describes the enhanced CI/CD pipeline with semantic release and multi-environment deployments for the DevPocket API server.

## Table of Contents

- [Overview](#overview)
- [Environment Configuration](#environment-configuration)
- [Workflow Triggers](#workflow-triggers)
- [Docker Image Tagging](#docker-image-tagging)
- [Deployment Process](#deployment-process)
- [Secrets and Configuration](#secrets-and-configuration)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring and Health Checks](#monitoring-and-health-checks)
- [Troubleshooting](#troubleshooting)

## Overview

The DevPocket API server uses a comprehensive multi-environment CI/CD pipeline that automatically deploys to different environments based on branch patterns. The pipeline includes:

- **Semantic versioning** with automated release management
- **Environment-specific configurations** and resource allocation
- **Incremental build tagging** for traceability
- **Automated health checks** and smoke tests
- **Rollback capabilities** for quick recovery

## Environment Configuration

| Environment | Branch Pattern | Domain | Namespace | Purpose |
|-------------|---------------|---------|-----------|---------|
| Development | `dev/*` | `api.dev.devpocket.app` | `devpocket-dev` | Feature development and testing |
| Beta | `beta` | `api.beta.devpocket.app` | `devpocket-beta` | Pre-production testing |
| Production | `main` | `api.devpocket.app` | `devpocket-prod` | Live production environment |

### Environment-Specific Settings

#### Development
- **Resources**: Reduced limits (128Mi-256Mi memory, 100m-300m CPU)
- **Logging**: Debug level enabled
- **Features**: Development optimizations
- **Replicas**: 1
- **Rate Limits**: Relaxed (200 requests/15min)

#### Beta
- **Resources**: Standard limits (256Mi-512Mi memory, 200m-500m CPU)
- **Logging**: Debug level enabled
- **Features**: Production-like configuration
- **Replicas**: 1
- **Rate Limits**: Moderate (150 requests/15min)

#### Production
- **Resources**: Full limits (256Mi-512Mi memory, 200m-500m CPU)
- **Logging**: Info level
- **Features**: Production optimizations
- **Replicas**: 2 (with auto-scaling)
- **Rate Limits**: Strict (100 requests/15min)

## Workflow Triggers

### Development Deployment (`deploy-dev.yml`)
**Triggers:**
- Push to any `dev/*` branch
- Manual workflow dispatch

**Process:**
1. Run tests and quality checks
2. Build Docker image with development tags
3. Deploy to development namespace
4. Run basic smoke tests

### Beta Deployment (`deploy-beta.yml`)
**Triggers:**
- Push to `beta` branch
- Manual workflow dispatch

**Process:**
1. Run comprehensive test suite
2. Execute semantic release (pre-release)
3. Build Docker image with beta tags
4. Deploy to beta namespace
5. Run full smoke tests and validation

### Production Deployment (`deploy-production.yml`)
**Triggers:**
- Push to `main` branch
- Manual workflow dispatch

**Process:**
1. Run comprehensive test suite
2. Execute semantic release (full release)
3. Build Docker image with production tags
4. Deploy to production namespace
5. Run extensive health checks and smoke tests
6. Verify deployment success

## Docker Image Tagging

### Tag Structure

Each environment uses a specific tagging strategy for Docker images:

#### Development Tags
- `dev-latest` - Latest development build
- `dev-{branch}-{run-number}-{sha}` - Specific build identifier

Example: `digitop/devpocket-nodejs:dev-feature-auth-123-abc1234`

#### Beta Tags
- `beta-latest` - Latest beta build
- `beta-{version}` - Semantic version (if released)
- `beta-{run-number}-{sha}` - Build-specific identifier

Example: `digitop/devpocket-nodejs:beta-1.2.0-beta.1`

#### Production Tags
- `latest` - Latest production release
- `v{semantic-version}` - Semantic version tag
- `main-{run-number}-{sha}` - Build-specific identifier

Example: `digitop/devpocket-nodejs:v1.2.0`

### Build Number Incrementation

Every workflow run increments the build number using GitHub Actions `run_number`, ensuring unique identifiers for each build across all environments.

## Deployment Process

### Pre-deployment Steps

1. **Environment Validation**
   - Check cluster connectivity
   - Verify namespace existence
   - Validate secrets and configurations

2. **Manifest Generation**
   - Create environment-specific manifests from templates
   - Apply environment-specific configurations
   - Update image references with correct tags

3. **Resource Preparation**
   - Create namespace if needed
   - Apply service and ingress configurations

### Deployment Steps

1. **Apply Kubernetes Manifests**
   ```yaml
   kubectl apply -f namespace.yaml
   kubectl apply -f service.yaml
   kubectl apply -f deployment.yaml
   kubectl apply -f ingress.yaml
   ```

2. **Wait for Rollout**
   - Monitor deployment progress
   - Wait for pods to be ready
   - Timeout after 5 minutes

3. **Health Verification**
   - Check pod status
   - Verify service endpoints
   - Test ingress connectivity

### Post-deployment Steps

1. **Smoke Tests**
   - Health endpoint verification
   - API functionality tests
   - WebSocket connectivity tests

2. **Notification**
   - Success/failure notifications
   - Deployment summary with versions
   - Link to environment URLs

## Secrets and Configuration

### Required Secrets

Each environment requires the following secrets to be configured in GitHub:

#### Docker Registry
- `DOCKER_USER` - Docker Hub username
- `DOCKER_PAT` - Docker Hub personal access token

#### Kubernetes Access
- `KUBECONFIG` - Production cluster configuration (base64 encoded)
- `KUBECONFIG_DEV` - Development cluster configuration (base64 encoded)
- `KUBECONFIG_BETA` - Beta cluster configuration (base64 encoded)

#### Semantic Release
- `GITHUB_TOKEN` - GitHub access token for releases
- `NPM_TOKEN` - NPM token for package publishing (optional)

### Kubernetes Secrets

Each environment namespace requires a `devpocket-secrets` secret with:
- `database-url` - PostgreSQL connection string
- `redis-url` - Redis connection string
- `jwt-secret` - JWT signing key
- `jwt-refresh-secret` - JWT refresh token key
- `google-client-id` - Google OAuth client ID (optional)
- `google-client-secret` - Google OAuth client secret (optional)
- `resend-api-key` - Email service API key (optional)

## Rollback Procedures

### Automated Rollback

Use the provided rollback script for quick recovery:

```bash
# Rollback to previous version
./scripts/deployment/rollback-deployment.sh -e prod

# Rollback to specific revision
./scripts/deployment/rollback-deployment.sh -e beta -r 3

# Dry run rollback
./scripts/deployment/rollback-deployment.sh -e dev -d
```

### Manual Rollback

1. **Identify Target Revision**
   ```bash
   kubectl rollout history deployment/devpocket-nodejs -n devpocket-prod
   ```

2. **Execute Rollback**
   ```bash
   kubectl rollout undo deployment/devpocket-nodejs -n devpocket-prod --to-revision=2
   ```

3. **Monitor Progress**
   ```bash
   kubectl rollout status deployment/devpocket-nodejs -n devpocket-prod
   ```

### Emergency Procedures

For critical issues requiring immediate action:

1. **Scale Down**
   ```bash
   kubectl scale deployment devpocket-nodejs --replicas=0 -n devpocket-prod
   ```

2. **Investigate and Fix**
   - Check logs and metrics
   - Identify root cause
   - Apply necessary fixes

3. **Scale Up**
   ```bash
   kubectl scale deployment devpocket-nodejs --replicas=2 -n devpocket-prod
   ```

## Monitoring and Health Checks

### Health Endpoints

Each deployment includes health check endpoints:
- `/api/v1/health` - Basic health check

### Monitoring Integration

The deployments are configured with:
- **Liveness Probes**: Ensure the application is running correctly
- **Resource Monitoring**: CPU and memory usage tracking

### Logging

Environment-specific logging levels:
- **Development**: Debug level for detailed troubleshooting
- **Beta**: Debug level for pre-production validation
- **Production**: Info level for optimal performance

Logs are available through:
```bash
kubectl logs -f deployment/devpocket-nodejs -n devpocket-{env}
```

## Troubleshooting

### Common Issues

#### Deployment Stuck in Pending
**Symptoms**: Pods remain in Pending state
**Solutions**:
- Check resource availability
- Verify node selectors and tolerations
- Ensure persistent volumes are available

#### Health Check Failures
**Symptoms**: Readiness/liveness probe failures
**Solutions**:
- Check application logs
- Verify database connectivity
- Ensure all required secrets are present

#### Image Pull Errors
**Symptoms**: Cannot pull Docker image
**Solutions**:
- Verify image tag exists
- Check Docker registry credentials
- Ensure image is accessible from cluster

### Debugging Commands

```bash
# Check pod status
kubectl get pods -n devpocket-{env} -l app.kubernetes.io/name=devpocket-nodejs

# View deployment events
kubectl describe deployment devpocket-nodejs -n devpocket-{env}

# Check logs
kubectl logs -f deployment/devpocket-nodejs -n devpocket-{env}

# Check service endpoints
kubectl get endpoints -n devpocket-{env}

# View ingress status
kubectl describe ingress devpocket-nodejs -n devpocket-{env}
```

### Recovery Procedures

1. **Application Issues**
   - Check application logs
   - Verify environment variables
   - Test database connectivity

2. **Kubernetes Issues**
   - Check cluster health
   - Verify resource quotas
   - Ensure networking is functional

3. **Infrastructure Issues**
   - Check cloud provider status
   - Verify DNS resolution
   - Test load balancer functionality

### Support Escalation

For issues requiring immediate attention:
1. Use rollback procedures to restore service
2. Document the issue with logs and error messages
3. Contact the DevOps team with incident details
4. Create post-mortem documentation for future prevention

## Best Practices

### Development
- Use feature branches (`dev/feature-name`)
- Test locally before pushing
- Keep commits focused and well-documented

### Beta Testing
- Deploy to beta before production
- Run comprehensive tests
- Validate new features thoroughly

### Production Deployment
- Always deploy during maintenance windows
- Monitor deployment progress
- Have rollback plan ready
- Communicate changes to stakeholders

### Security
- Regularly update dependencies
- Rotate secrets periodically
- Monitor for security vulnerabilities
- Follow least privilege principles

This comprehensive deployment guide ensures reliable, scalable, and maintainable operations across all environments.
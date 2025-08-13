# DevPocket API Deployment Guide

## Overview

This document describes the CI/CD pipeline and deployment process for the DevPocket API server to Kubernetes.

## Architecture

- **Docker Registry**: Docker Hub (`docker.io/digitop/devpocket-nodejs`)
- **Kubernetes Cluster**: Production cluster with namespace `devpocket-prod`
- **CI/CD**: GitHub Actions with automated testing, building, and deployment
- **Environment Management**: Kubernetes Deployments with self-healing capabilities
- **Resource Strategy**: Parallel provisioning and scaling-based start/stop operations

## GitHub Secrets Required

Ensure the following secrets are configured in your GitHub repository:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `KUBECONFIG` | Base64-encoded kubeconfig file for cluster access | `base64 /path/to/kubeconfig` |
| `DOCKER_USER` | Docker Hub username | `digitop` |
| `DOCKER_PAT` | Docker Hub Personal Access Token | `dckr_pat_xxxxx` |

## Deployment Workflows

### 1. Development CI (`.github/workflows/ci.yml`)

**Triggers**: 
- Push to `dev/*` branches
- Pull requests to `main` or `beta/*` branches

**Process**:
- Runs simplified unit tests (no database required)
- Linting and type checking
- Docker build verification
- Coverage reporting

### 2. Production Deployment (`.github/workflows/deploy-production.yml`)

**Triggers**:
- Push to `main` branch
- Manual dispatch with force deploy option

**Process**:
1. **Test Stage**: Simplified CI tests
2. **Build Stage**: Docker image build and push to registry
3. **Deploy Stage**: Kubernetes deployment with rolling updates
4. **Verify Stage**: Health checks and smoke tests

## Simplified Testing Strategy

For faster CI/CD pipeline, we use simplified testing:

- **Configuration**: `jest.ci.config.js`
- **Test Types**: Unit tests only (no integration tests)
- **Database**: Mocked/stubbed (no real database connections)
- **Timeout**: Reduced to 15 seconds
- **Parallel**: Up to 2 workers for faster execution

## Kubernetes Resources

### Namespace
- **Name**: `devpocket-prod`
- **Purpose**: Production environment isolation

### Core Resources
- `k8s/namespace.yaml` - Namespace definition
- `k8s/deployment.yaml` - Main application deployment with self-healing
- `k8s/service.yaml` - Internal service exposure
- `k8s/ingress.yaml` - External traffic routing
- `k8s/configmap.yaml` - Configuration data (if exists)
- `k8s/secret.yaml` - Sensitive data (manually managed)
- `k8s/hpa.yaml` - Horizontal Pod Autoscaler (if exists)

### Environment Architecture Improvements

The DevPocket API now uses an enhanced Kubernetes architecture for managing development environments:

#### Kubernetes Deployments (instead of Pods)
- **Self-Healing**: Automatic pod restart on failures
- **Rolling Updates**: Zero-downtime updates and configuration changes
- **Replica Management**: Consistent desired state management
- **Resource Management**: Better resource allocation and limits

#### Parallel Resource Creation
- **PVC + ConfigMap**: Created simultaneously for faster provisioning
- **Deployment + Service**: Created after dependencies are ready
- **30-50% Faster**: Reduced environment creation time
- **Error Handling**: Automatic cleanup on creation failures

#### Scaling-Based Operations
- **Start Environment**: Scale Deployment from 0→1 replicas (10-30 seconds)
- **Stop Environment**: Scale Deployment from 1→0 replicas (graceful)
- **Configuration Preservation**: Maintains all Kubernetes resources
- **Fast Recovery**: Quick restart without resource recreation

### Image Strategy
- **Latest**: `digitop/devpocket-nodejs:latest` (main branch)
- **Versioned**: `digitop/devpocket-nodejs:main-{commit-sha}`
- **Branch**: `digitop/devpocket-nodejs:{branch-name}`

## Deployment Process

### Automatic Deployment (Recommended)

1. Push code to `main` branch
2. GitHub Actions automatically:
   - Runs tests
   - Builds Docker image
   - Pushes to Docker Hub
   - Deploys to Kubernetes
   - Verifies deployment health

### Manual Deployment

1. **Force Deploy** (skip failed tests):
   ```bash
   # Via GitHub UI: Actions -> Deploy to Production -> Run workflow
   # Select "Force deploy even if tests fail: true"
   ```

2. **Manual kubectl** (emergency):
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

## Health Checks

### Application Health
- **Endpoint**: `https://api.devpocket.app/health`
- **Expected**: HTTP 200 OK
- **Kubernetes**: Readiness and liveness probes configured

### Deployment Verification
```bash
kubectl get pods -n devpocket-prod -l app.kubernetes.io/name=devpocket-nodejs
kubectl get services -n devpocket-prod devpocket-nodejs
kubectl get ingress -n devpocket-prod devpocket-nodejs
```

## Rollback Strategy

### Automatic Rollback
- If health checks fail, deployment will be marked as failed
- Manual intervention required for rollback

### Manual Rollback
```bash
# Check deployment history
kubectl rollout history deployment/devpocket-nodejs -n devpocket-prod

# Rollback to previous version
kubectl rollout undo deployment/devpocket-nodejs -n devpocket-prod

# Rollback to specific revision
kubectl rollout undo deployment/devpocket-nodejs -n devpocket-prod --to-revision=2
```

## Environment Management Architecture

### Kubernetes Resources per Environment
Each development environment consists of:
- **Deployment**: `env-{environmentId}` with self-healing capabilities
- **Service**: `svc-{environmentId}` for network access
- **PVC**: `pvc-{environmentId}` for persistent storage
- **ConfigMap**: `config-{environmentId}` for startup scripts
- **Namespace**: `devpocket-{userId}` for user isolation

### Deployment Lifecycle
1. **Creation**: Parallel resource provisioning (PVC, ConfigMap, Deployment, Service)
2. **Running**: Deployment maintains 1 replica with health checks
3. **Stopped**: Deployment scaled to 0 replicas (resources preserved)
4. **Restart**: Quick scaling back to 1 replica
5. **Deletion**: Complete resource cleanup

## Monitoring & Troubleshooting

### Check Deployment Status
```bash
kubectl rollout status deployment/devpocket-nodejs -n devpocket-prod
```

### Monitor Environment Deployments
```bash
# List all environment deployments
kubectl get deployments -A -l "app.kubernetes.io/component=environment"

# Check specific environment deployment
kubectl get deployment env-{environmentId} -n devpocket-{userId}

# Monitor environment scaling events
kubectl get events -n devpocket-{userId} --sort-by='.lastTimestamp'
```

### View Logs
```bash
kubectl logs -n devpocket-prod -l app.kubernetes.io/name=devpocket-nodejs --tail=100 -f
```

### Debug Pod Issues
```bash
# Debug main API pods
kubectl describe pod -n devpocket-prod -l app.kubernetes.io/name=devpocket-nodejs

# Debug environment pods
kubectl describe deployment env-{environmentId} -n devpocket-{userId}
kubectl describe pod -n devpocket-{userId} -l "app.kubernetes.io/name=env-{environmentId}"

# Check environment resource status
kubectl get pvc,configmap,svc -n devpocket-{userId}
```

### Check Resource Utilization
```bash
kubectl top pods -n devpocket-prod
kubectl top nodes
```

## Environment Variables

The application uses the following environment configuration in production:

### Database
- `DATABASE_URL`: PostgreSQL connection string (from secret)

### Authentication
- `JWT_SECRET`: JWT signing key (from secret)
- `GOOGLE_CLIENT_ID`: Google OAuth client ID (from secret)
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret (from secret)

### External Services
- `RESEND_API_KEY`: Email service API key (from secret)

### Application Settings
- `NODE_ENV`: Set to "production"
- `PORT`: Set to 8000
- `CLUSTER_NAME`: Set to "production-cluster"

## Security Considerations

1. **Secrets Management**: All sensitive data stored in Kubernetes secrets
2. **Image Security**: Non-root user execution in containers
3. **Network Security**: Ingress with TLS termination
4. **Resource Limits**: CPU and memory limits configured
5. **Security Context**: Read-only root filesystem where possible

## Scaling

### API Server Scaling
#### Horizontal Pod Autoscaler (HPA)
If `k8s/hpa.yaml` is configured:
- Automatically scales based on CPU/memory usage
- Min/max replica configuration
- Target utilization thresholds

#### Manual API Scaling
```bash
kubectl scale deployment/devpocket-nodejs -n devpocket-prod --replicas=3
```

### Environment Scaling (Start/Stop)
Environments use deployment scaling for fast start/stop:

#### Start Environment
```bash
kubectl scale deployment env-{environmentId} -n devpocket-{userId} --replicas=1
```

#### Stop Environment
```bash
kubectl scale deployment env-{environmentId} -n devpocket-{userId} --replicas=0
```

#### Benefits of Scaling-Based Operations
- **Fast Operations**: 10-30 seconds vs 1-5 minutes for pod recreation
- **Resource Preservation**: Maintains Deployment, Service, PVC, ConfigMap
- **Configuration Integrity**: No loss of environment variables or startup scripts
- **Network Consistency**: Service endpoints remain stable
- **Storage Persistence**: Data survives start/stop cycles

## Disaster Recovery

### Backup Strategy
- Database backups handled separately
- Application code in Git repository
- Docker images in Docker Hub registry

### Recovery Process
1. Restore database from backup
2. Redeploy application using CI/CD pipeline
3. Verify all services are operational

## Cost Optimization

1. **Resource Requests**: Set appropriate CPU/memory requests
2. **Image Optimization**: Multi-stage Docker builds
3. **Caching**: Docker layer caching in CI/CD
4. **Cleanup**: Old image cleanup (implement if needed)

## Support

For deployment issues:
1. Check GitHub Actions logs
2. Review Kubernetes events and logs
3. Verify external dependencies (database, external APIs)
4. Contact DevOps team if infrastructure issues persist
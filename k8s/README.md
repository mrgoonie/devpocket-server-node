# DevPocket Kubernetes Authentication Implementation

This directory contains the Kubernetes manifests and scripts for implementing hybrid authentication in the DevPocket API server.

## Overview

The DevPocket API server now supports hybrid Kubernetes authentication:

1. **In-cluster authentication**: Uses Kubernetes ServiceAccount tokens when running inside a cluster
2. **External authentication**: Falls back to kubeconfig from database when running outside a cluster
3. **SSL verification**: Enabled by default for all Kubernetes API connections

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DevPocket API Server                     │
├─────────────────────────────────────────────────────────────┤
│  Hybrid Authentication Logic                                │
│                                                             │
│  1. Check if running in-cluster                            │
│     ├─ YES: Load ServiceAccount token                      │
│     │       ├─ SUCCESS: Use in-cluster config              │
│     │       └─ FAIL: Fall back to external kubeconfig     │
│     └─ NO: Load external kubeconfig from database          │
│                                                             │
│  2. Enable SSL verification for all connections             │
│  3. Create Kubernetes API clients                          │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│               Kubernetes Cluster                           │
│                                                             │
│  RBAC Resources:                                           │
│  ├─ ServiceAccount: devpocket-api                         │
│  ├─ ClusterRole: devpocket-api                            │
│  └─ ClusterRoleBinding: devpocket-api                     │
│                                                             │
│  Permissions:                                              │
│  ├─ Namespaces: create, get, list, watch, delete          │
│  ├─ Pods: create, get, list, watch, delete, patch, update │
│  ├─ Services: create, get, list, watch, delete            │
│  ├─ PVCs: create, get, list, watch, delete                │
│  ├─ ConfigMaps: create, get, list, watch, delete          │
│  └─ Deployments: create, get, list, watch, delete         │
└─────────────────────────────────────────────────────────────┘
```

## Files

### RBAC Manifests

- **`rbac/namespace.yaml`**: Creates the `devpocket-system` namespace for production deployments
- **`rbac/serviceaccount.yaml`**: Defines ServiceAccounts for both default and devpocket-system namespaces
- **`rbac/clusterrole.yaml`**: Defines permissions required by the DevPocket API server
- **`rbac/clusterrolebinding.yaml`**: Binds the ServiceAccount to the ClusterRole

### Deployment Resources

- **`deployment.yaml`**: Complete Kubernetes deployment manifest for the API server
- **`secrets-template.yaml`**: Template for creating secrets (database credentials, JWT secrets, etc.)
- **`deploy-rbac.sh`**: Script to deploy RBAC resources with verification

## Implementation Details

### Code Changes

The main changes are in `/src/services/kubernetes.ts`:

1. **`isRunningInCluster()`**: Detects if the API server is running inside a Kubernetes cluster by checking for ServiceAccount files
2. **`getKubernetesClient()`**: Implements hybrid authentication logic
3. **`loadExternalKubeconfig()`**: Handles loading kubeconfig from the database (existing functionality)
4. **`configureSSLVerification()`**: Ensures SSL verification is enabled

### Security Improvements

1. **SSL Verification**: Removed all `verify_ssl = false` configurations
2. **Service Account Authentication**: Uses Kubernetes-native authentication when available
3. **Least Privilege**: RBAC permissions are scoped to only what's needed
4. **Secrets Management**: Sensitive data moved to Kubernetes secrets

## Deployment

### Prerequisites

1. Kubernetes cluster with RBAC enabled
2. kubectl configured to access the cluster
3. Appropriate permissions to create ClusterRoles and ClusterRoleBindings

### Step-by-Step Deployment

1. **Deploy RBAC resources**:
   ```bash
   cd k8s
   ./deploy-rbac.sh
   ```

2. **Create secrets**:
   ```bash
   # Copy and edit the template
   cp secrets-template.yaml secrets.yaml
   # Edit secrets.yaml with your actual values
   kubectl apply -f secrets.yaml
   ```

3. **Deploy the API server**:
   ```bash
   kubectl apply -f deployment.yaml
   ```

### Verification

The deployment script includes verification steps that check:

- ServiceAccount creation
- ClusterRole and ClusterRoleBinding creation
- Permission testing using `kubectl auth can-i`

## Permissions

The ClusterRole grants the following permissions:

### Core API Resources
- **Namespaces**: Full CRUD operations for environment isolation
- **Pods**: Full CRUD + exec/logs for development environments
- **Services**: Full CRUD for environment networking
- **PersistentVolumeClaims**: Full CRUD for persistent storage
- **ConfigMaps**: Full CRUD for environment configuration
- **Events**: Read access for monitoring and debugging

### Apps API Resources
- **Deployments**: Full CRUD + status/scale for environment management

### Batch API Resources
- **Jobs/CronJobs**: Full CRUD for potential batch processing

### Metrics API Resources
- **Pods/Nodes metrics**: Read access for resource monitoring

## Testing

### Local Testing

When running locally (outside Kubernetes), the API server will:

1. Detect it's not in-cluster
2. Load kubeconfig from the database
3. Use external authentication
4. Enable SSL verification

### In-Cluster Testing

When running inside Kubernetes, the API server will:

1. Detect it's in-cluster
2. Load ServiceAccount token
3. Use in-cluster authentication
4. Enable SSL verification

### Testing Authentication Method

You can test which authentication method is being used by checking the logs:

```bash
# Local logs
tail -f logs/devpocket.log | grep "authentication"

# Kubernetes logs
kubectl logs -f deployment/devpocket-api | grep "authentication"
```

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**:
   - Verify RBAC resources are deployed correctly
   - Check ServiceAccount is bound to the deployment
   - Test permissions with `kubectl auth can-i`

2. **SSL Certificate Errors**:
   - Ensure cluster CA certificates are properly configured
   - Check if cluster uses self-signed certificates

3. **Authentication Fallback Not Working**:
   - Verify database contains valid kubeconfig
   - Check kubeconfig decryption is working
   - Ensure external cluster is accessible

### Debug Commands

```bash
# Check RBAC resources
kubectl get serviceaccount devpocket-api
kubectl get clusterrole devpocket-api
kubectl get clusterrolebinding devpocket-api

# Test permissions
kubectl auth can-i create pods --as=system:serviceaccount:default:devpocket-api
kubectl auth can-i create namespaces --as=system:serviceaccount:default:devpocket-api

# Check deployment
kubectl get deployment devpocket-api
kubectl describe deployment devpocket-api
kubectl logs deployment/devpocket-api

# Check service account token
kubectl get serviceaccount devpocket-api -o yaml
kubectl describe secret $(kubectl get serviceaccount devpocket-api -o jsonpath='{.secrets[0].name}')
```

## Security Considerations

1. **Principle of Least Privilege**: The ClusterRole only grants necessary permissions
2. **Namespace Isolation**: Each user's environments run in separate namespaces
3. **SSL/TLS**: All communications with Kubernetes API use SSL verification
4. **Secret Management**: Sensitive data stored in Kubernetes secrets, not ConfigMaps
5. **Service Account Tokens**: Automatically rotated by Kubernetes

## Migration Guide

### From External-Only Authentication

1. Deploy RBAC resources
2. Update deployment to use ServiceAccount
3. Restart API server
4. Verify hybrid authentication is working

### Rolling Back

If you need to rollback to external-only authentication:

1. Remove `serviceAccountName` from deployment
2. Restart API server
3. Remove RBAC resources (optional)

The code will automatically fallback to external authentication only.

## Future Enhancements

1. **Multi-Cluster Support**: Extend to support multiple Kubernetes clusters
2. **Workload Identity**: Support cloud provider workload identity
3. **Certificate Management**: Automatic certificate rotation
4. **Metrics**: Add Prometheus metrics for authentication success/failure rates
5. **Audit Logging**: Enhanced audit logging for security compliance
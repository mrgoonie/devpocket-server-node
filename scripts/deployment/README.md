# Deployment Scripts

This directory contains utility scripts for managing DevPocket API deployments across different environments.

## Scripts Overview

### `generate-manifests.sh`
Generates environment-specific Kubernetes manifests from templates.

**Usage:**
```bash
./generate-manifests.sh -e <environment> -i <image> [-v <version>] [-o <output_dir>]
```

**Examples:**
```bash
# Generate dev manifests
./generate-manifests.sh -e dev -i digitop/devpocket-nodejs:dev-latest

# Generate beta manifests with version
./generate-manifests.sh -e beta -i digitop/devpocket-nodejs:beta-1.2.0 -v 1.2.0

# Generate prod manifests
./generate-manifests.sh -e prod -i digitop/devpocket-nodejs:v1.2.0 -v 1.2.0
```

### `cleanup-environments.sh`
Cleans up deployments and resources from specific environments.

**Usage:**
```bash
./cleanup-environments.sh -e <environment> [-n <namespace>] [-d] [-f]
```

**Examples:**
```bash
# Dry run cleanup for dev
./cleanup-environments.sh -e dev -d

# Force cleanup beta environment
./cleanup-environments.sh -e beta -f

# Interactive cleanup for production
./cleanup-environments.sh -e prod

# Cleanup specific namespace
./cleanup-environments.sh -n devpocket-dev-feature-x
```

### `rollback-deployment.sh`
Rolls back deployments to previous versions.

**Usage:**
```bash
./rollback-deployment.sh -e <environment> [-n <namespace>] [-r <revision>] [-d] [-f]
```

**Examples:**
```bash
# Rollback to previous version
./rollback-deployment.sh -e prod

# Rollback to specific revision
./rollback-deployment.sh -e beta -r 3

# Dry run rollback
./rollback-deployment.sh -e dev -d
```

## Environment Support

All scripts support the following environments:
- `dev` - Development environment (`devpocket-dev` namespace)
- `beta` - Beta environment (`devpocket-beta` namespace)
- `prod` - Production environment (`devpocket-prod` namespace)

## Prerequisites

- `kubectl` installed and configured
- Access to the Kubernetes cluster
- Proper permissions for the target namespaces

## Security Notes

- **Production deployments** require explicit confirmation unless using `-f` flag
- **Dry run mode** (`-d`) is recommended for testing commands
- Scripts validate inputs and check for required resources before execution
- All operations are logged with colored output for better visibility

## Troubleshooting

If scripts fail:
1. Check kubectl connectivity: `kubectl cluster-info`
2. Verify namespace access: `kubectl get namespaces`
3. Ensure proper permissions for the target resources
4. Check script logs for specific error messages

For detailed deployment information, see [docs/MULTI_ENVIRONMENT_DEPLOYMENT.md](../../docs/MULTI_ENVIRONMENT_DEPLOYMENT.md).
#!/bin/bash

# DevPocket Deployment Rollback Script
# This script helps rollback deployments to previous versions

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
NAMESPACE=""
REVISION=""
DRY_RUN=false
FORCE=false

usage() {
    echo "Usage: $0 -e <environment> [-n <namespace>] [-r <revision>] [-d] [-f]"
    echo "  -e, --environment  Environment to rollback (dev, beta, prod)"
    echo "  -n, --namespace    Specific namespace (optional, derived from environment if not provided)"
    echo "  -r, --revision     Specific revision to rollback to (optional, defaults to previous)"
    echo "  -d, --dry-run      Show what would be rolled back without actually doing it"
    echo "  -f, --force        Force rollback without confirmation"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev -d                    # Dry run rollback for dev environment"
    echo "  $0 -e beta -r 3                 # Rollback beta to revision 3"
    echo "  $0 -e prod                      # Interactive rollback for production"
}

log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -r|--revision)
            REVISION="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option $1"
            usage
            exit 1
            ;;
    esac
done

# Validate inputs
if [[ -z "$ENVIRONMENT" && -z "$NAMESPACE" ]]; then
    error "Either environment (-e) or namespace (-n) must be specified"
    usage
    exit 1
fi

# Set namespace based on environment if not explicitly provided
if [[ -n "$ENVIRONMENT" && -z "$NAMESPACE" ]]; then
    case $ENVIRONMENT in
        dev)
            NAMESPACE="devpocket-dev"
            ;;
        beta)
            NAMESPACE="devpocket-beta"
            ;;
        prod)
            NAMESPACE="devpocket-prod"
            ;;
        *)
            error "Unknown environment: $ENVIRONMENT. Use dev, beta, or prod"
            exit 1
            ;;
    esac
fi

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    error "Namespace '$NAMESPACE' does not exist"
    exit 1
fi

# Check if deployment exists
DEPLOYMENT_NAME="devpocket-nodejs"
if ! kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" &> /dev/null; then
    error "Deployment '$DEPLOYMENT_NAME' does not exist in namespace '$NAMESPACE'"
    exit 1
fi

log "Checking rollout history for deployment '$DEPLOYMENT_NAME' in namespace '$NAMESPACE'"

# Get rollout history
HISTORY=$(kubectl rollout history deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" 2>/dev/null)
if [[ -z "$HISTORY" ]]; then
    error "No rollout history found for deployment '$DEPLOYMENT_NAME'"
    exit 1
fi

echo "Rollout history:"
echo "$HISTORY"
echo ""

# Get current revision
CURRENT_REVISION=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')
log "Current revision: $CURRENT_REVISION"

# Determine target revision
if [[ -n "$REVISION" ]]; then
    TARGET_REVISION="$REVISION"
    log "Target revision (specified): $TARGET_REVISION"
else
    # Get previous revision (current - 1)
    if [[ "$CURRENT_REVISION" -gt 1 ]]; then
        TARGET_REVISION=$((CURRENT_REVISION - 1))
        log "Target revision (previous): $TARGET_REVISION"
    else
        error "No previous revision available to rollback to"
        exit 1
    fi
fi

# Validate target revision exists
if ! kubectl rollout history deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --revision="$TARGET_REVISION" &> /dev/null; then
    error "Revision $TARGET_REVISION does not exist"
    exit 1
fi

# Show what will be rolled back to
log "Rollback details:"
kubectl rollout history deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --revision="$TARGET_REVISION"
echo ""

# Dry run mode
if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN: Would rollback deployment '$DEPLOYMENT_NAME' from revision $CURRENT_REVISION to revision $TARGET_REVISION"
    exit 0
fi

# Confirmation (unless force mode)
if [[ "$FORCE" != "true" ]]; then
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        warn "You are about to rollback a PRODUCTION deployment!"
        echo ""
    fi
    read -p "Are you sure you want to rollback deployment '$DEPLOYMENT_NAME' from revision $CURRENT_REVISION to revision $TARGET_REVISION? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Rollback cancelled"
        exit 0
    fi
fi

# Perform rollback
log "Starting rollback of deployment '$DEPLOYMENT_NAME' to revision $TARGET_REVISION..."

if kubectl rollout undo deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --to-revision="$TARGET_REVISION"; then
    success "Rollback initiated successfully"
else
    error "Failed to initiate rollback"
    exit 1
fi

# Wait for rollback to complete
log "Waiting for rollback to complete..."
if kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout=300s; then
    success "Rollback completed successfully"
else
    error "Rollback timed out or failed"
    exit 1
fi

# Verify rollback
NEW_REVISION=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')
log "New current revision: $NEW_REVISION"

# Get pod status
log "Current pod status:"
kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=devpocket-nodejs

# Check health
log "Checking deployment health..."
READY_REPLICAS=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}')
DESIRED_REPLICAS=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

if [[ "$READY_REPLICAS" == "$DESIRED_REPLICAS" ]]; then
    success "Deployment is healthy ($READY_REPLICAS/$DESIRED_REPLICAS replicas ready)"
else
    warn "Deployment may not be fully healthy ($READY_REPLICAS/$DESIRED_REPLICAS replicas ready)"
fi

success "Rollback completed successfully!"
log "Deployment '$DEPLOYMENT_NAME' has been rolled back from revision $CURRENT_REVISION to revision $TARGET_REVISION"
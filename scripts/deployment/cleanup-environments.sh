#!/bin/bash

# DevPocket Environment Cleanup Script
# This script helps clean up deployments across different environments

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
DRY_RUN=false
FORCE=false

usage() {
    echo "Usage: $0 -e <environment> [-n <namespace>] [-d] [-f]"
    echo "  -e, --environment  Environment to cleanup (dev, beta, prod)"
    echo "  -n, --namespace    Specific namespace (optional, derived from environment if not provided)"
    echo "  -d, --dry-run      Show what would be deleted without actually deleting"
    echo "  -f, --force        Force deletion without confirmation"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev -d                    # Dry run cleanup for dev environment"
    echo "  $0 -e beta -f                   # Force cleanup beta environment"
    echo "  $0 -e prod                      # Interactive cleanup for production"
    echo "  $0 -n devpocket-dev-feature-x  # Cleanup specific namespace"
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
    warn "Namespace '$NAMESPACE' does not exist"
    exit 0
fi

log "Preparing to cleanup environment: ${ENVIRONMENT:-"custom"} (namespace: $NAMESPACE)"

# Get list of resources to delete
RESOURCES_TO_DELETE=()

# Check for deployments
if kubectl get deployments -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    DEPLOYMENTS=$(kubectl get deployments -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null)
    while IFS= read -r deployment; do
        [[ -n "$deployment" ]] && RESOURCES_TO_DELETE+=("deployment/$deployment")
    done <<< "$DEPLOYMENTS"
fi

# Check for services
if kubectl get services -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    SERVICES=$(kubectl get services -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null | grep -v kubernetes)
    while IFS= read -r service; do
        [[ -n "$service" ]] && RESOURCES_TO_DELETE+=("service/$service")
    done <<< "$SERVICES"
fi

# Check for ingresses
if kubectl get ingresses -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    INGRESSES=$(kubectl get ingresses -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null)
    while IFS= read -r ingress; do
        [[ -n "$ingress" ]] && RESOURCES_TO_DELETE+=("ingress/$ingress")
    done <<< "$INGRESSES"
fi

# Check for configmaps (exclude default ones)
if kubectl get configmaps -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    CONFIGMAPS=$(kubectl get configmaps -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null | grep -v -E '^(kube-root-ca.crt)$')
    while IFS= read -r configmap; do
        [[ -n "$configmap" ]] && RESOURCES_TO_DELETE+=("configmap/$configmap")
    done <<< "$CONFIGMAPS"
fi

# Check for secrets (exclude default ones)
if kubectl get secrets -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    SECRETS=$(kubectl get secrets -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null | grep -v -E '^(default-token-|sh\.helm\.release\.)')
    while IFS= read -r secret; do
        [[ -n "$secret" ]] && RESOURCES_TO_DELETE+=("secret/$secret")
    done <<< "$SECRETS"
fi

# Check for PVCs
if kubectl get pvc -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q .; then
    PVCS=$(kubectl get pvc -n "$NAMESPACE" --no-headers -o custom-columns=":metadata.name" 2>/dev/null)
    while IFS= read -r pvc; do
        [[ -n "$pvc" ]] && RESOURCES_TO_DELETE+=("pvc/$pvc")
    done <<< "$PVCS"
fi

# Display what will be deleted
if [[ ${#RESOURCES_TO_DELETE[@]} -eq 0 ]]; then
    success "No resources found to cleanup in namespace '$NAMESPACE'"
    exit 0
fi

log "Found ${#RESOURCES_TO_DELETE[@]} resources to delete:"
for resource in "${RESOURCES_TO_DELETE[@]}"; do
    echo "  - $resource"
done

# Dry run mode
if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY RUN: Would delete the above resources from namespace '$NAMESPACE'"
    exit 0
fi

# Confirmation (unless force mode)
if [[ "$FORCE" != "true" ]]; then
    echo ""
    read -p "Are you sure you want to delete these resources from namespace '$NAMESPACE'? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Cleanup cancelled"
        exit 0
    fi
fi

# Delete resources
log "Starting cleanup of namespace '$NAMESPACE'..."

# Delete in proper order (most dependent first)
RESOURCE_ORDER=("ingress" "service" "deployment" "configmap" "secret" "pvc")

for resource_type in "${RESOURCE_ORDER[@]}"; do
    for resource in "${RESOURCES_TO_DELETE[@]}"; do
        if [[ "$resource" == "$resource_type/"* ]]; then
            log "Deleting $resource..."
            if kubectl delete "$resource" -n "$NAMESPACE" --timeout=60s; then
                success "Deleted $resource"
            else
                warn "Failed to delete $resource"
            fi
        fi
    done
done

# Wait for pods to terminate
log "Waiting for pods to terminate..."
if ! kubectl wait --for=delete pods --all -n "$NAMESPACE" --timeout=120s 2>/dev/null; then
    warn "Some pods may still be terminating"
fi

# Option to delete the namespace itself
if [[ "$FORCE" == "true" ]] || [[ "$ENVIRONMENT" != "prod" ]]; then
    echo ""
    read -p "Do you want to delete the namespace '$NAMESPACE' itself? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Deleting namespace '$NAMESPACE'..."
        if kubectl delete namespace "$NAMESPACE" --timeout=120s; then
            success "Deleted namespace '$NAMESPACE'"
        else
            warn "Failed to delete namespace '$NAMESPACE'"
        fi
    fi
fi

success "Cleanup completed for namespace '$NAMESPACE'"
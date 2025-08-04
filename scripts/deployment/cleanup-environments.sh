#!/bin/bash

# DevPocket Environment Cleanup Script
# This script cleans up environment-specific Kubernetes resources

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

# Resource cleanup order (reversed dependency order)
RESOURCE_ORDER=("ingress" "service" "deployment" "configmap" "secret" "pvc")

usage() {
    echo "Usage: $0 [-e <environment>] [-n <namespace>] [-d] [-f] [-h]"
    echo "  -e, --environment  Environment (dev, beta, prod)"
    echo "  -n, --namespace    Kubernetes namespace (alternative to environment)"
    echo "  -d, --dry-run      Show what would be deleted without actually deleting"
    echo "  -f, --force        Skip confirmation prompts"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev"
    echo "  $0 -n devpocket-beta"
    echo "  $0 -e prod -d"
    echo "  $0 -n devpocket-dev -f"
    echo ""
    echo "Note: Either environment (-e) or namespace (-n) must be specified"
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

# Function to check if kubectl is available
check_dependencies() {
    if ! command -v kubectl >/dev/null 2>&1; then
        error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Test kubectl connectivity
    if ! kubectl cluster-info >/dev/null 2>&1; then
        error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
}

# Function to validate and set namespace
validate_environment() {
    if [[ -n "$ENVIRONMENT" ]]; then
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
    
    if [[ -z "$NAMESPACE" ]]; then
        error "Either environment (-e) or namespace (-n) must be specified"
        usage
        exit 1
    fi
    
    # Verify namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        warn "Namespace '$NAMESPACE' does not exist"
        if [[ "$FORCE" == "false" ]]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log "Operation cancelled"
                exit 0
            fi
        fi
    fi
}

# Function to list resources in namespace
list_resources() {
    local resource_type="$1"
    local timeout="30s"
    
    kubectl get "$resource_type" -n "$NAMESPACE" --no-headers 2>/dev/null | \
        grep -v kubernetes | \
        grep -v -E '^(kube-root-ca.crt)$' | \
        grep -v -E '^(default-token-|sh\.helm\.release\.)' | \
        awk '{print $1}' || true
}

# Function to delete resources
delete_resources() {
    local resource_type="$1"
    local resources
    
    resources=$(list_resources "$resource_type")
    
    if [[ -z "$resources" ]]; then
        log "No $resource_type resources found in namespace $NAMESPACE"
        return 0
    fi
    
    log "Found $resource_type resources in namespace $NAMESPACE:"
    echo "$resources" | sed 's/^/  - /'
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warn "Would delete the above resources (dry-run mode)"
        return 0
    fi
    
    if [[ "$FORCE" == "false" ]] && [[ "$resource_type" != "configmap" ]] && [[ "$resource_type" != "secret" ]]; then
        read -p "Delete these $resource_type resources? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Skipping $resource_type deletion"
            return 0
        fi
    fi
    
    echo "$resources" | while IFS= read -r resource; do
        if [[ -n "$resource" ]]; then
            log "Deleting $resource_type: $resource"
            if kubectl delete "$resource_type" "$resource" -n "$NAMESPACE" --timeout=60s; then
                success "Deleted $resource_type: $resource"
            else
                error "Failed to delete $resource_type: $resource"
            fi
        fi
    done
}

# Function to cleanup namespace
cleanup_namespace() {
    log "Starting cleanup for namespace: $NAMESPACE"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warn "Running in dry-run mode - no resources will be deleted"
    fi
    
    # Delete resources in reverse dependency order
    for resource_type in "${RESOURCE_ORDER[@]}"; do
        log "Processing $resource_type resources..."
        delete_resources "$resource_type"
    done
    
    # Check if namespace should be deleted
    local remaining_resources
    remaining_resources=$(kubectl get all -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0")
    
    if [[ "$remaining_resources" -eq 0 ]]; then
        log "Namespace $NAMESPACE appears to be empty"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            warn "Would delete namespace $NAMESPACE (dry-run mode)"
        else
            if [[ "$FORCE" == "false" ]]; then
                read -p "Delete the empty namespace $NAMESPACE? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    kubectl delete namespace "$NAMESPACE"
                    success "Deleted namespace: $NAMESPACE"
                else
                    log "Keeping namespace: $NAMESPACE"
                fi
            else
                kubectl delete namespace "$NAMESPACE"
                success "Deleted namespace: $NAMESPACE"
            fi
        fi
    else
        warn "Namespace $NAMESPACE still contains resources, not deleting"
        log "Remaining resources:"
        kubectl get all -n "$NAMESPACE" 2>/dev/null || true
    fi
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
if [[ -z "$ENVIRONMENT" ]] && [[ -z "$NAMESPACE" ]]; then
    error "Either environment (-e) or namespace (-n) must be specified"
    usage
    exit 1
fi

# Main execution
log "DevPocket Environment Cleanup"
log "==============================="

check_dependencies
validate_environment

# Production safety check
if [[ "$ENVIRONMENT" == "prod" ]] && [[ "$FORCE" == "false" ]]; then
    warn "You are about to cleanup a PRODUCTION environment!"
    warn "This will delete all resources in namespace: $NAMESPACE"
    read -p "Are you absolutely sure? Type 'DELETE PRODUCTION' to continue: " -r
    if [[ "$REPLY" != "DELETE PRODUCTION" ]]; then
        log "Operation cancelled for safety"
        exit 0
    fi
fi

cleanup_namespace

if [[ "$DRY_RUN" == "true" ]]; then
    log "Dry-run completed. Use -f flag to perform actual cleanup."
else
    success "Environment cleanup completed!"
fi
#!/bin/bash

# DevPocket Deployment Rollback Script
# This script rolls back deployments to previous versions

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
DEPLOYMENT_NAME="devpocket-nodejs"

usage() {
    echo "Usage: $0 [-e <environment>] [-n <namespace>] [-r <revision>] [-d] [-f] [-h]"
    echo "  -e, --environment  Environment (dev, beta, prod)"
    echo "  -n, --namespace    Kubernetes namespace (alternative to environment)"
    echo "  -r, --revision     Specific revision to rollback to (optional)"
    echo "  -d, --dry-run      Show what would be rolled back without actually doing it"
    echo "  -f, --force        Skip confirmation prompts"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev"
    echo "  $0 -n devpocket-beta -r 3"
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
        error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    # Verify deployment exists
    if ! kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
        error "Deployment '$DEPLOYMENT_NAME' does not exist in namespace '$NAMESPACE'"
        exit 1
    fi
}

# Function to get rollout history
get_rollout_history() {
    log "Getting rollout history for deployment: $DEPLOYMENT_NAME"
    
    if ! kubectl rollout history deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE"; then
        error "Failed to get rollout history"
        exit 1
    fi
}

# Function to get current revision
get_current_revision() {
    kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null || echo "unknown"
}

# Function to calculate target revision
calculate_target_revision() {
    local CURRENT_REVISION
    CURRENT_REVISION=$(get_current_revision)
    
    if [[ -n "$REVISION" ]]; then
        TARGET_REVISION="$REVISION"
        log "Using specified revision: $TARGET_REVISION"
    else
        if [[ "$CURRENT_REVISION" == "unknown" ]]; then
            error "Cannot determine current revision"
            exit 1
        fi
        
        TARGET_REVISION=$((CURRENT_REVISION - 1))
        
        if [[ "$TARGET_REVISION" -lt 1 ]]; then
            error "No previous revision available"
            exit 1
        fi
        
        log "Rolling back from revision $CURRENT_REVISION to revision $TARGET_REVISION"
    fi
}

# Function to show deployment status
show_deployment_status() {
    log "Current deployment status:"
    kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o wide
    
    log "Current pods:"
    kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=devpocket-nodejs -o wide
}

# Function to perform rollback
perform_rollback() {
    local timeout=300s
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warn "Would rollback deployment $DEPLOYMENT_NAME to revision $TARGET_REVISION (dry-run mode)"
        return 0
    fi
    
    log "Rolling back deployment $DEPLOYMENT_NAME to revision $TARGET_REVISION..."
    
    if kubectl rollout undo deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --to-revision="$TARGET_REVISION"; then
        success "Rollback command executed successfully"
        
        log "Waiting for rollback to complete (timeout: $timeout)..."
        if kubectl rollout status deployment/"$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout="$timeout"; then
            success "Rollback completed successfully!"
            
            # Show final status
            log "Final deployment status:"
            show_deployment_status
        else
            error "Rollback timed out or failed"
            
            log "Current deployment status:"
            show_deployment_status
            
            if [[ "$FORCE" == "false" ]]; then
                read -p "Would you like to check the rollback status manually? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    log "You can check the status with:"
                    log "  kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE"
                    log "  kubectl get pods -n $NAMESPACE"
                fi
            fi
            
            exit 1
        fi
    else
        error "Failed to execute rollback command"
        exit 1
    fi
}

# Function to verify rollback success
verify_rollback() {
    log "Verifying rollback success..."
    
    # Check if pods are ready
    local ready_pods
    ready_pods=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=devpocket-nodejs --no-headers 2>/dev/null | awk '{print $2}' | grep -E '^[0-9]+/[0-9]+$' | awk -F'/' '$1==$2 {count++} END {print count+0}')
    
    local total_pods
    total_pods=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=devpocket-nodejs --no-headers 2>/dev/null | wc -l)
    
    if [[ "$ready_pods" -eq "$total_pods" ]] && [[ "$total_pods" -gt 0 ]]; then
        success "All $ready_pods pods are ready and running"
        
        # Verify health endpoint if possible
        log "Checking application health..."
        local pod_name
        pod_name=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=devpocket-nodejs --no-headers | head -1 | awk '{print $1}')
        
        if kubectl exec -n "$NAMESPACE" "$pod_name" -- curl -s http://localhost:8000/health >/dev/null 2>&1; then
            success "Application health check passed"
        else
            warn "Application health check failed or not available"
        fi
    else
        warn "Not all pods are ready: $ready_pods/$total_pods"
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
if [[ -z "$ENVIRONMENT" ]] && [[ -z "$NAMESPACE" ]]; then
    error "Either environment (-e) or namespace (-n) must be specified"
    usage
    exit 1
fi

# Main execution
log "DevPocket Deployment Rollback"
log "=============================="

check_dependencies
validate_environment

# Production safety check
if [[ "$ENVIRONMENT" == "prod" ]] && [[ "$FORCE" == "false" ]]; then
    warn "You are about to rollback a PRODUCTION deployment!"
    warn "This will rollback the deployment in namespace: $NAMESPACE"
    read -p "Are you absolutely sure? Type 'ROLLBACK PRODUCTION' to continue: " -r
    if [[ "$REPLY" != "ROLLBACK PRODUCTION" ]]; then
        log "Operation cancelled for safety"
        exit 0
    fi
fi

# Show current status
show_deployment_status

# Get rollout history
get_rollout_history

# Calculate target revision
calculate_target_revision

# Final confirmation
if [[ "$FORCE" == "false" ]] && [[ "$DRY_RUN" == "false" ]]; then
    read -p "Proceed with rollback to revision $TARGET_REVISION? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Rollback cancelled"
        exit 0
    fi
fi

# Perform rollback
perform_rollback

# Verify rollback if not dry-run
if [[ "$DRY_RUN" == "false" ]]; then
    verify_rollback
fi

if [[ "$DRY_RUN" == "true" ]]; then
    log "Dry-run completed. Remove -d flag to perform actual rollback."
else
    success "Deployment rollback completed successfully!"
fi
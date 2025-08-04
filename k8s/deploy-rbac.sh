#!/bin/bash

# DevPocket RBAC Deployment Script
# This script deploys the necessary RBAC resources for DevPocket API server
# to operate with in-cluster service account authentication

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE_DEFAULT="default"
NAMESPACE_PROD="devpocket-system"
RBAC_DIR="$(dirname "$0")/rbac"
DRY_RUN="${DRY_RUN:-false}"
CLEANUP="${CLEANUP:-false}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Unable to connect to Kubernetes cluster"
        print_error "Please ensure your kubeconfig is properly configured"
        exit 1
    fi
    
    print_success "kubectl is available and cluster is accessible"
}

# Function to validate RBAC manifests
validate_manifests() {
    print_status "Validating RBAC manifests..."
    
    local manifests=("namespace.yaml" "serviceaccount.yaml" "clusterrole.yaml" "clusterrolebinding.yaml")
    
    for manifest in "${manifests[@]}"; do
        local file_path="${RBAC_DIR}/${manifest}"
        if [[ ! -f "$file_path" ]]; then
            print_error "Required manifest not found: $file_path"
            exit 1
        fi
        
        # Validate YAML syntax
        if ! kubectl apply -f "$file_path" --dry-run=client --validate=true &> /dev/null; then
            print_error "Invalid YAML syntax in $manifest"
            exit 1
        fi
        
        print_success "✓ $manifest is valid"
    done
}

# Function to deploy RBAC resources
deploy_rbac() {
    print_status "Deploying RBAC resources..."
    
    # Apply manifests in correct order
    local manifests=(
        "namespace.yaml"
        "serviceaccount.yaml"
        "clusterrole.yaml"
        "clusterrolebinding.yaml"
    )
    
    for manifest in "${manifests[@]}"; do
        local file_path="${RBAC_DIR}/${manifest}"
        print_status "Applying $manifest..."
        
        if [[ "$DRY_RUN" == "true" ]]; then
            kubectl apply -f "$file_path" --dry-run=server
        else
            kubectl apply -f "$file_path"
        fi
        
        print_success "✓ Applied $manifest"
    done
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying RBAC deployment..."
    
    # Check namespace
    if kubectl get namespace devpocket-system &> /dev/null; then
        print_success "✓ Namespace 'devpocket-system' exists"
    else
        print_error "✗ Namespace 'devpocket-system' not found"
        return 1
    fi
    
    # Check service accounts
    local namespaces=("$NAMESPACE_DEFAULT" "$NAMESPACE_PROD")
    for ns in "${namespaces[@]}"; do
        if kubectl get serviceaccount devpocket-api -n "$ns" &> /dev/null; then
            print_success "✓ ServiceAccount 'devpocket-api' exists in namespace '$ns'"
        else
            print_error "✗ ServiceAccount 'devpocket-api' not found in namespace '$ns'"
            return 1
        fi
    done
    
    # Check ClusterRole
    if kubectl get clusterrole devpocket-api &> /dev/null; then
        print_success "✓ ClusterRole 'devpocket-api' exists"
    else
        print_error "✗ ClusterRole 'devpocket-api' not found"
        return 1
    fi
    
    # Check ClusterRoleBinding
    if kubectl get clusterrolebinding devpocket-api &> /dev/null; then
        print_success "✓ ClusterRoleBinding 'devpocket-api' exists"
    else
        print_error "✗ ClusterRoleBinding 'devpocket-api' not found"
        return 1
    fi
}

# Function to test RBAC permissions
test_permissions() {
    print_status "Testing RBAC permissions..."
    
    local sa_default="system:serviceaccount:${NAMESPACE_DEFAULT}:devpocket-api"
    local sa_prod="system:serviceaccount:${NAMESPACE_PROD}:devpocket-api"
    
    # Test essential permissions
    local permissions=(
        "create namespaces"
        "create persistentvolumeclaims"
        "create deployments"
        "create services"
        "create configmaps"
        "get pods"
        "list pods"
        "get pods/log"
    )
    
    for sa in "$sa_default" "$sa_prod"; do
        print_status "Testing permissions for $sa"
        
        for permission in "${permissions[@]}"; do
            if kubectl auth can-i $permission --as="$sa" --quiet; then
                print_success "✓ Can $permission"
            else
                print_error "✗ Cannot $permission"
                return 1
            fi
        done
    done
    
    # Test denied permissions
    local denied_permissions=(
        "create secrets"
        "create clusterroles"
        "create clusterrolebindings"
        "delete nodes"
    )
    
    print_status "Verifying denied permissions..."
    for sa in "$sa_default"; do
        for permission in "${denied_permissions[@]}"; do
            if kubectl auth can-i $permission --as="$sa" --quiet; then
                print_warning "⚠ Unexpectedly allowed: $permission"
            else
                print_success "✓ Correctly denied: $permission"
            fi
        done
    done
}

# Function to cleanup RBAC resources
cleanup_rbac() {
    print_status "Cleaning up RBAC resources..."
    
    # Delete in reverse order
    local manifests=(
        "clusterrolebinding.yaml"
        "clusterrole.yaml"
        "serviceaccount.yaml"
        "namespace.yaml"
    )
    
    for manifest in "${manifests[@]}"; do
        local file_path="${RBAC_DIR}/${manifest}"
        print_status "Deleting resources from $manifest..."
        
        if kubectl delete -f "$file_path" --ignore-not-found=true; then
            print_success "✓ Deleted resources from $manifest"
        else
            print_warning "⚠ Some resources from $manifest may not exist"
        fi
    done
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Deploy RBAC resources for DevPocket API server"
    echo ""
    echo "Options:"
    echo "  --dry-run       Run in dry-run mode (no actual changes)"
    echo "  --cleanup       Remove RBAC resources instead of deploying"
    echo "  --skip-tests    Skip permission testing"
    echo "  --help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  DRY_RUN=true    Same as --dry-run"
    echo "  CLEANUP=true    Same as --cleanup"
    echo ""
    echo "Examples:"
    echo "  $0                    Deploy RBAC resources"
    echo "  $0 --dry-run          Test deployment without making changes"
    echo "  $0 --cleanup          Remove RBAC resources"
}

# Main execution
main() {
    local skip_tests=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --cleanup)
                CLEANUP=true
                shift
                ;;
            --skip-tests)
                skip_tests=true
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    print_status "Starting DevPocket RBAC deployment..."
    print_status "Dry run: $DRY_RUN"
    print_status "Cleanup mode: $CLEANUP"
    
    # Pre-flight checks
    check_kubectl
    
    if [[ "$CLEANUP" == "true" ]]; then
        cleanup_rbac
        print_success "RBAC cleanup completed successfully!"
        exit 0
    fi
    
    # Validate manifests
    validate_manifests
    
    # Deploy RBAC resources
    deploy_rbac
    
    if [[ "$DRY_RUN" != "true" ]]; then
        # Verify deployment
        if verify_deployment; then
            print_success "RBAC deployment verification passed!"
        else
            print_error "RBAC deployment verification failed!"
            exit 1
        fi
        
        # Test permissions
        if [[ "$skip_tests" != "true" ]]; then
            if test_permissions; then
                print_success "RBAC permission testing passed!"
            else
                print_error "RBAC permission testing failed!"
                exit 1
            fi
        fi
    fi
    
    print_success "DevPocket RBAC deployment completed successfully!"
    
    if [[ "$DRY_RUN" != "true" ]]; then
        echo ""
        print_status "Next steps:"
        echo "1. Update your DevPocket deployment to use the service account:"
        echo "   spec.template.spec.serviceAccountName: devpocket-api"
        echo "2. Deploy your DevPocket API server to the cluster"
        echo "3. The API server will automatically use in-cluster authentication"
    fi
}

# Execute main function with all arguments
main "$@"
EOF < /dev/null
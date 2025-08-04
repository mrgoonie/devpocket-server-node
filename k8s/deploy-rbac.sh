#!/bin/bash

# DevPocket RBAC Deployment Script
# This script deploys the RBAC resources required for DevPocket API server
# to use hybrid Kubernetes authentication (in-cluster service account + external kubeconfig fallback)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    print_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we can connect to the cluster
if ! kubectl cluster-info &> /dev/null; then
    print_error "Cannot connect to Kubernetes cluster. Please check your kubeconfig."
    exit 1
fi

print_status "Deploying DevPocket RBAC resources..."

# Get current context for confirmation
CURRENT_CONTEXT=$(kubectl config current-context)
print_status "Current Kubernetes context: $CURRENT_CONTEXT"

# Ask for confirmation
read -p "Deploy RBAC resources to this cluster? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled."
    exit 0
fi

# Deploy namespace (optional, for production)
print_status "Creating devpocket-system namespace..."
if kubectl apply -f rbac/namespace.yaml; then
    print_success "Namespace created/updated"
else
    print_warning "Failed to create namespace (might already exist)"
fi

# Deploy ServiceAccount
print_status "Creating ServiceAccount..."
if kubectl apply -f rbac/serviceaccount.yaml; then
    print_success "ServiceAccount created/updated"
else
    print_error "Failed to create ServiceAccount"
    exit 1
fi

# Deploy ClusterRole
print_status "Creating ClusterRole..."
if kubectl apply -f rbac/clusterrole.yaml; then
    print_success "ClusterRole created/updated"
else
    print_error "Failed to create ClusterRole"
    exit 1
fi

# Deploy ClusterRoleBinding
print_status "Creating ClusterRoleBinding..."
if kubectl apply -f rbac/clusterrolebinding.yaml; then
    print_success "ClusterRoleBinding created/updated"
else
    print_error "Failed to create ClusterRoleBinding"
    exit 1
fi

# Verify RBAC resources
print_status "Verifying RBAC resources..."

# Check ServiceAccount
if kubectl get serviceaccount devpocket-api -n default &> /dev/null; then
    print_success "ServiceAccount 'devpocket-api' exists in default namespace"
else
    print_error "ServiceAccount 'devpocket-api' not found in default namespace"
fi

if kubectl get serviceaccount devpocket-api -n devpocket-system &> /dev/null; then
    print_success "ServiceAccount 'devpocket-api' exists in devpocket-system namespace"
else
    print_warning "ServiceAccount 'devpocket-api' not found in devpocket-system namespace"
fi

# Check ClusterRole
if kubectl get clusterrole devpocket-api &> /dev/null; then
    print_success "ClusterRole 'devpocket-api' exists"
else
    print_error "ClusterRole 'devpocket-api' not found"
fi

# Check ClusterRoleBinding
if kubectl get clusterrolebinding devpocket-api &> /dev/null; then
    print_success "ClusterRoleBinding 'devpocket-api' exists"
else
    print_error "ClusterRoleBinding 'devpocket-api' not found"
fi

# Test permissions
print_status "Testing permissions..."

# Test if ServiceAccount can create namespaces
if kubectl auth can-i create namespaces --as=system:serviceaccount:default:devpocket-api &> /dev/null; then
    print_success "ServiceAccount can create namespaces"
else
    print_error "ServiceAccount cannot create namespaces"
fi

# Test if ServiceAccount can manage pods
if kubectl auth can-i create pods --as=system:serviceaccount:default:devpocket-api &> /dev/null; then
    print_success "ServiceAccount can create pods"
else
    print_error "ServiceAccount cannot create pods"
fi

# Test if ServiceAccount can manage services
if kubectl auth can-i create services --as=system:serviceaccount:default:devpocket-api &> /dev/null; then
    print_success "ServiceAccount can create services"
else
    print_error "ServiceAccount cannot create services"
fi

print_status "RBAC deployment completed!"
print_status ""
print_status "Next steps:"
print_status "1. Update your deployment manifest to use serviceAccountName: devpocket-api"
print_status "2. Create secrets using: kubectl apply -f secrets.yaml (copy from secrets-template.yaml)"
print_status "3. Deploy the API server using: kubectl apply -f deployment.yaml"
print_status ""
print_status "The API server will now use hybrid authentication:"
print_status "- In-cluster: Service Account tokens (when running inside Kubernetes)"
print_status "- External: Kubeconfig from database (when running outside Kubernetes)"
print_status "- SSL verification is enabled for all connections"
#!/bin/bash

# DevPocket Manifest Generation Script
# This script generates environment-specific Kubernetes manifests from templates

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
IMAGE=""
VERSION="latest"
OUTPUT_DIR=""

usage() {
    echo "Usage: $0 -e <environment> -i <image> [-v <version>] [-o <output_dir>]"
    echo "  -e, --environment  Environment (dev, beta, prod)"
    echo "  -i, --image        Docker image to use"
    echo "  -v, --version      Version/tag (default: latest)"
    echo "  -o, --output-dir   Output directory (default: k8s/<environment>)"
    echo "  -h, --help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -e dev -i digitop/devpocket-nodejs:dev-latest"
    echo "  $0 -e beta -i digitop/devpocket-nodejs:beta-1.2.0 -v 1.2.0"
    echo "  $0 -e prod -i digitop/devpocket-nodejs:v1.2.0 -v 1.2.0"
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

# Function to replace template variables
replace_template_vars() {
    local template_file="$1"
    local output_file="$2"
    
    # Environment-specific configurations
    case $ENVIRONMENT in
        dev)
            NAMESPACE="devpocket-dev"
            DOMAIN="api.dev.devpocket.app"
            DOMAIN_SAFE="api-dev-devpocket-app"
            NODE_ENV="development"
            DEBUG="true"
            LOG_LEVEL="debug"
            REPLICAS="1"
            MEMORY_REQUEST="128Mi"
            MEMORY_LIMIT="256Mi"
            CPU_REQUEST="100m"
            CPU_LIMIT="300m"
            FRONTEND_URL="https://dev.devpocket.app"
            CLUSTER_NAME="development-cluster"
            RATE_LIMIT_WINDOW_MS="900000"
            RATE_LIMIT_MAX_REQUESTS="200"
            AUTH_RATE_LIMIT_MAX_REQUESTS="10"
            ENV_RATE_LIMIT_MAX_REQUESTS="20"
            ;;
        beta)
            NAMESPACE="devpocket-beta"
            DOMAIN="api.beta.devpocket.app"
            DOMAIN_SAFE="api-beta-devpocket-app"
            NODE_ENV="beta"
            DEBUG="true"
            LOG_LEVEL="debug"
            REPLICAS="1"
            MEMORY_REQUEST="256Mi"
            MEMORY_LIMIT="512Mi"
            CPU_REQUEST="200m"
            CPU_LIMIT="500m"
            FRONTEND_URL="https://beta.devpocket.app"
            CLUSTER_NAME="beta-cluster"
            RATE_LIMIT_WINDOW_MS="900000"
            RATE_LIMIT_MAX_REQUESTS="150"
            AUTH_RATE_LIMIT_MAX_REQUESTS="8"
            ENV_RATE_LIMIT_MAX_REQUESTS="15"
            ;;
        prod)
            NAMESPACE="devpocket-prod"
            DOMAIN="api.devpocket.app"
            DOMAIN_SAFE="api-devpocket-app"
            NODE_ENV="production"
            DEBUG="false"
            LOG_LEVEL="info"
            REPLICAS="2"
            MEMORY_REQUEST="256Mi"
            MEMORY_LIMIT="512Mi"
            CPU_REQUEST="200m"
            CPU_LIMIT="500m"
            FRONTEND_URL="https://app.devpocket.com"
            CLUSTER_NAME="production-cluster"
            RATE_LIMIT_WINDOW_MS="900000"
            RATE_LIMIT_MAX_REQUESTS="100"
            AUTH_RATE_LIMIT_MAX_REQUESTS="5"
            ENV_RATE_LIMIT_MAX_REQUESTS="10"
            ;;
        *)
            error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
    
    # Replace template variables
    sed -e "s|{{ NAMESPACE }}|$NAMESPACE|g" \
        -e "s|{{ ENVIRONMENT }}|$ENVIRONMENT|g" \
        -e "s|{{ IMAGE }}|$IMAGE|g" \
        -e "s|{{ VERSION }}|$VERSION|g" \
        -e "s|{{ DOMAIN }}|$DOMAIN|g" \
        -e "s|{{ DOMAIN_SAFE }}|$DOMAIN_SAFE|g" \
        -e "s|{{ NODE_ENV }}|$NODE_ENV|g" \
        -e "s|{{ DEBUG }}|$DEBUG|g" \
        -e "s|{{ LOG_LEVEL }}|$LOG_LEVEL|g" \
        -e "s|{{ REPLICAS }}|$REPLICAS|g" \
        -e "s|{{ MEMORY_REQUEST }}|$MEMORY_REQUEST|g" \
        -e "s|{{ MEMORY_LIMIT }}|$MEMORY_LIMIT|g" \
        -e "s|{{ CPU_REQUEST }}|$CPU_REQUEST|g" \
        -e "s|{{ CPU_LIMIT }}|$CPU_LIMIT|g" \
        -e "s|{{ FRONTEND_URL }}|$FRONTEND_URL|g" \
        -e "s|{{ CLUSTER_NAME }}|$CLUSTER_NAME|g" \
        -e "s|{{ RATE_LIMIT_WINDOW_MS }}|$RATE_LIMIT_WINDOW_MS|g" \
        -e "s|{{ RATE_LIMIT_MAX_REQUESTS }}|$RATE_LIMIT_MAX_REQUESTS|g" \
        -e "s|{{ AUTH_RATE_LIMIT_MAX_REQUESTS }}|$AUTH_RATE_LIMIT_MAX_REQUESTS|g" \
        -e "s|{{ ENV_RATE_LIMIT_MAX_REQUESTS }}|$ENV_RATE_LIMIT_MAX_REQUESTS|g" \
        "$template_file" > "$output_file"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -o|--output-dir)
            OUTPUT_DIR="$2"
            shift 2
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
if [[ -z "$ENVIRONMENT" ]]; then
    error "Environment (-e) is required"
    usage
    exit 1
fi

if [[ -z "$IMAGE" ]]; then
    error "Image (-i) is required"
    usage
    exit 1
fi

if [[ ! "$ENVIRONMENT" =~ ^(dev|beta|prod)$ ]]; then
    error "Environment must be one of: dev, beta, prod"
    exit 1
fi

# Set default output directory
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="k8s/$ENVIRONMENT"
fi

# Find script directory and template directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TEMPLATE_DIR="$PROJECT_ROOT/k8s/templates"

# Handle relative vs absolute output paths
if [[ "$OUTPUT_DIR" = /* ]]; then
    # Absolute path
    FULL_OUTPUT_DIR="$OUTPUT_DIR"
else
    # Relative path
    FULL_OUTPUT_DIR="$PROJECT_ROOT/$OUTPUT_DIR"
fi

# Validate template directory exists
if [[ ! -d "$TEMPLATE_DIR" ]]; then
    error "Template directory not found: $TEMPLATE_DIR"
    exit 1
fi

# Create output directory
mkdir -p "$FULL_OUTPUT_DIR"

log "Generating manifests for environment: $ENVIRONMENT"
log "Using image: $IMAGE"
log "Version: $VERSION"
log "Output directory: $FULL_OUTPUT_DIR"

# Generate manifests from templates
TEMPLATES=("namespace.yaml" "service.yaml" "deployment.yaml" "ingress.yaml")

for template in "${TEMPLATES[@]}"; do
    template_file="$TEMPLATE_DIR/$template"
    output_file="$FULL_OUTPUT_DIR/$template"
    
    if [[ -f "$template_file" ]]; then
        log "Generating $template..."
        replace_template_vars "$template_file" "$output_file"
        success "Generated $output_file"
    else
        warn "Template not found: $template_file"
    fi
done

# Create a summary file
cat > "$FULL_OUTPUT_DIR/README.md" << EOF
# DevPocket $ENVIRONMENT Environment Manifests

Generated on: $(date)
Environment: $ENVIRONMENT
Image: $IMAGE
Version: $VERSION

## Files

- \`namespace.yaml\` - Namespace definition
- \`service.yaml\` - Service definition
- \`deployment.yaml\` - Deployment definition
- \`ingress.yaml\` - Ingress definition

## Deployment

To deploy these manifests:

\`\`\`bash
kubectl apply -f namespace.yaml
kubectl apply -f service.yaml
kubectl apply -f deployment.yaml
kubectl apply -f ingress.yaml
\`\`\`

## Cleanup

To remove the deployment:

\`\`\`bash
kubectl delete -f ingress.yaml
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f namespace.yaml
\`\`\`
EOF

success "Manifest generation completed!"
log "Manifests generated in: $FULL_OUTPUT_DIR"
log "Summary available in: $FULL_OUTPUT_DIR/README.md"
#!/bin/bash

# DevPocket CI/CD Pipeline Test Runner
# This script runs comprehensive tests to validate the multi-environment CI/CD pipeline

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Default values
VERBOSE=false
QUICK=false
DRY_RUN=false
TEST_PATTERN=""
GENERATE_REPORT=false
CLEANUP=true

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -v, --verbose       Enable verbose output"
    echo "  -q, --quick         Run only essential tests (faster)"
    echo "  -d, --dry-run       Show what would be tested without running"
    echo "  -p, --pattern       Run tests matching specific pattern"
    echo "  -r, --report        Generate detailed test report"
    echo "  --no-cleanup        Skip cleanup of temporary files"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Run all CI/CD pipeline tests"
    echo "  $0 --quick                           # Run essential tests only"
    echo "  $0 --pattern \"workflow\"              # Run workflow-related tests only"
    echo "  $0 --verbose --report                # Run with verbose output and generate report"
    echo "  $0 --dry-run                         # Show test plan without execution"
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

section() {
    echo -e "${PURPLE}[SECTION]${NC} $1"
    echo "=============================================="
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -q|--quick)
            QUICK=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -p|--pattern)
            TEST_PATTERN="$2"
            shift 2
            ;;
        -r|--report)
            GENERATE_REPORT=true
            shift
            ;;
        --no-cleanup)
            CLEANUP=false
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

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Validate project structure
if [[ ! -f "package.json" ]]; then
    error "package.json not found. Are you in the correct directory?"
    exit 1
fi

if [[ ! -d ".github/workflows" ]]; then
    error ".github/workflows directory not found"
    exit 1
fi

section "DevPocket CI/CD Pipeline Test Suite"
log "Project: $(jq -r '.name' package.json 2>/dev/null || echo 'DevPocket Server')"
log "Version: $(jq -r '.version' package.json 2>/dev/null || echo 'Unknown')"
log "Mode: $([ "$QUICK" = true ] && echo "Quick" || echo "Full")"
log "Pattern: ${TEST_PATTERN:-"All tests"}"
log "Dry Run: $DRY_RUN"
echo ""

# Test categories and descriptions
get_test_description() {
    case $1 in
        "workflow-validation") echo "GitHub Actions workflow syntax and configuration validation" ;;
        "kubernetes-manifest") echo "Kubernetes manifest generation and validation" ;;
        "deployment-scripts") echo "Deployment script functionality and dry-run testing" ;;
        "semantic-release") echo "Semantic release configuration and branch rules" ;;
        "multi-environment") echo "Multi-environment consistency and isolation" ;;
        "pipeline-integration") echo "End-to-end CI/CD pipeline flow simulation" ;;
        "backward-compatibility") echo "Backward compatibility with existing deployments" ;;
        *) echo "Unknown test category" ;;
    esac
}

# All available test categories
ALL_TEST_CATEGORIES=(
    "workflow-validation"
    "kubernetes-manifest"
    "deployment-scripts"
    "semantic-release"
    "multi-environment"
    "pipeline-integration"
    "backward-compatibility"
)

# Essential tests for quick mode
ESSENTIAL_TESTS=(
    "workflow-validation"
    "kubernetes-manifest"
    "semantic-release"
    "backward-compatibility"
)

# Test execution function
run_test_category() {
    local category=$1
    local description=$(get_test_description "$category")
    
    section "Testing: $description"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "Would run: pnpm test tests/ci-cd/${category}.test.ts"
        return 0
    fi
    
    local test_file="tests/ci-cd/${category}.test.ts"
    
    # Handle file name mappings
    case $category in
        "kubernetes-manifest") test_file="tests/ci-cd/kubernetes-manifest-validation.test.ts" ;;
        "semantic-release") test_file="tests/ci-cd/semantic-release-config.test.ts" ;;
    esac
    if [[ ! -f "$test_file" ]]; then
        warn "Test file not found: $test_file"
        return 1
    fi
    
    local jest_args=""
    if [[ "$VERBOSE" == "true" ]]; then
        jest_args="--verbose"
    fi
    
    if [[ -n "$TEST_PATTERN" ]]; then
        jest_args="$jest_args --testNamePattern=\"$TEST_PATTERN\""
    fi
    
    log "Running: pnpm test $test_file $jest_args"
    
    if pnpm test "$test_file" $jest_args; then
        success "✅ $description - PASSED"
        return 0
    else
        error "❌ $description - FAILED"
        return 1
    fi
}

# Pre-flight checks
section "Pre-flight Checks"

log "Checking Node.js and pnpm..."
if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    error "pnpm is not installed"
    exit 1
fi

NODE_VERSION=$(node --version)
PNPM_VERSION=$(pnpm --version)
log "Node.js: $NODE_VERSION"
log "pnpm: $PNPM_VERSION"

log "Installing dependencies..."
if [[ "$DRY_RUN" == "false" ]]; then
    if ! pnpm install --frozen-lockfile; then
        error "Failed to install dependencies"
        exit 1
    fi
fi

log "Checking test directory structure..."
TEST_DIR="tests/ci-cd"
if [[ ! -d "$TEST_DIR" ]]; then
    error "CI/CD test directory not found: $TEST_DIR"
    exit 1
fi

success "Pre-flight checks completed"
echo ""

# Generate test plan
section "Test Execution Plan"

TESTS_TO_RUN=()
if [[ "$QUICK" == "true" ]]; then
    log "Quick mode: Running essential tests only"
    for test in "${ESSENTIAL_TESTS[@]}"; do
        if [[ -z "$TEST_PATTERN" ]] || [[ "$test" =~ $TEST_PATTERN ]]; then
            TESTS_TO_RUN+=("$test")
        fi
    done
else
    log "Full mode: Running all available tests"
    for test in "${ALL_TEST_CATEGORIES[@]}"; do
        if [[ -z "$TEST_PATTERN" ]] || [[ "$test" =~ $TEST_PATTERN ]]; then
            TESTS_TO_RUN+=("$test")
        fi
    done
fi

log "Tests to execute: ${#TESTS_TO_RUN[@]}"
for test in "${TESTS_TO_RUN[@]}"; do
    echo "  - $test: $(get_test_description "$test")"
done
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    success "Dry run completed. Exiting without test execution."
    exit 0
fi

# Execute tests
section "Test Execution"

PASSED_TESTS=0
FAILED_TESTS=0
FAILED_TEST_NAMES=()
START_TIME=$(date +%s)

for test in "${TESTS_TO_RUN[@]}"; do
    if run_test_category "$test"; then
        ((PASSED_TESTS++))
    else
        ((FAILED_TESTS++))
        FAILED_TEST_NAMES+=("$test")
    fi
    echo ""
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate summary
section "Test Results Summary"

log "Execution time: ${DURATION} seconds"
log "Total tests: $((PASSED_TESTS + FAILED_TESTS))"
success "Passed: $PASSED_TESTS"

if [[ $FAILED_TESTS -gt 0 ]]; then
    error "Failed: $FAILED_TESTS"
    echo ""
    error "Failed test categories:"
    for failed_test in "${FAILED_TEST_NAMES[@]}"; do
        echo "  - $failed_test: $(get_test_description "$failed_test")"
    done
else
    success "All tests passed! ✅"
fi

# Generate detailed report if requested
if [[ "$GENERATE_REPORT" == "true" ]]; then
    section "Generating Test Report"
    
    REPORT_DIR="reports/ci-cd"
    REPORT_FILE="$REPORT_DIR/pipeline-test-report-$(date +%Y%m%d-%H%M%S).md"
    
    mkdir -p "$REPORT_DIR"
    
    cat > "$REPORT_FILE" << EOF
# DevPocket CI/CD Pipeline Test Report

**Generated:** $(date)
**Project:** $(jq -r '.name' package.json 2>/dev/null || echo 'DevPocket Server')
**Version:** $(jq -r '.version' package.json 2>/dev/null || echo 'Unknown')
**Test Mode:** $([ "$QUICK" = true ] && echo "Quick" || echo "Full")
**Duration:** ${DURATION} seconds

## Summary

- **Total Tests:** $((PASSED_TESTS + FAILED_TESTS))
- **Passed:** $PASSED_TESTS
- **Failed:** $FAILED_TESTS
- **Success Rate:** $(( PASSED_TESTS * 100 / (PASSED_TESTS + FAILED_TESTS) ))%

## Test Categories

EOF

    for test in "${TESTS_TO_RUN[@]}"; do
        if [[ " ${FAILED_TEST_NAMES[@]} " =~ " ${test} " ]]; then
            echo "- ❌ **$test**: $(get_test_description "$test")" >> "$REPORT_FILE"
        else
            echo "- ✅ **$test**: $(get_test_description "$test")" >> "$REPORT_FILE"
        fi
    done
    
    if [[ $FAILED_TESTS -gt 0 ]]; then
        cat >> "$REPORT_FILE" << EOF

## Failed Tests

The following test categories failed and require attention:

EOF
        for failed_test in "${FAILED_TEST_NAMES[@]}"; do
            echo "### $failed_test" >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
            echo "$(get_test_description "$failed_test")" >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
            echo "**Recommendation:** Review the test output above for specific failures and fix the identified issues." >> "$REPORT_FILE"
            echo "" >> "$REPORT_FILE"
        done
    fi
    
    cat >> "$REPORT_FILE" << EOF

## Test Coverage

This test suite validates:

1. **GitHub Actions Workflows**
   - YAML syntax validation
   - Environment-specific configurations
   - Branch triggering logic
   - Docker tagging strategies
   - Job dependencies and conditions

2. **Kubernetes Manifests**
   - Template rendering for each environment
   - Environment-specific values
   - Generated YAML validation
   - Security configurations

3. **Deployment Scripts**
   - Script functionality and permissions
   - Dry-run capabilities
   - Error handling and validation
   - Environment-specific parameters

4. **Semantic Release**
   - Branch configuration
   - Conventional commits processing
   - Version calculation rules
   - Pre-release handling

5. **Multi-Environment Consistency**
   - Namespace isolation
   - Domain routing
   - Resource allocation
   - Secret management

6. **Pipeline Integration**
   - End-to-end flow simulation
   - Build and deployment sequence
   - Health checks and verification
   - Error handling and rollback

7. **Backward Compatibility**
   - Existing deployment preservation
   - Service mapping compatibility
   - API endpoint functionality
   - Configuration consistency

## Next Steps

EOF

    if [[ $FAILED_TESTS -eq 0 ]]; then
        echo "🎉 All tests passed! Your CI/CD pipeline is ready for production use." >> "$REPORT_FILE"
    else
        echo "⚠️ Some tests failed. Please address the issues identified above before deploying the pipeline." >> "$REPORT_FILE"
    fi
    
    success "Test report generated: $REPORT_FILE"
fi

# Cleanup temporary files
if [[ "$CLEANUP" == "true" ]]; then
    log "Cleaning up temporary files..."
    find . -name "temp-*-test" -type d -exec rm -rf {} + 2>/dev/null || true
    success "Cleanup completed"
fi

# Exit with appropriate code
if [[ $FAILED_TESTS -gt 0 ]]; then
    error "CI/CD pipeline tests completed with failures"
    exit 1
else
    success "CI/CD pipeline tests completed successfully"
    exit 0
fi
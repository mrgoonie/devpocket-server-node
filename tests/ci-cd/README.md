# CI/CD Pipeline Test Suite

This comprehensive test suite validates the multi-environment CI/CD pipeline implementation for DevPocket Server. The tests ensure that the pipeline is production-ready, secure, and maintains backward compatibility.

## Overview

The CI/CD pipeline test suite consists of 7 test categories that validate all aspects of the deployment pipeline:

1. **GitHub Actions Workflow Validation** - YAML syntax, environment configs, branch triggers
2. **Kubernetes Manifest Generation** - Template rendering, environment-specific values, YAML validation
3. **Deployment Scripts Testing** - Script functionality, dry-run modes, error handling
4. **Semantic Release Configuration** - Version calculation, branch rules, conventional commits
5. **Multi-Environment Consistency** - Namespace isolation, domain routing, resource allocation
6. **Pipeline Integration Testing** - End-to-end flow simulation, health checks, rollback scenarios
7. **Backward Compatibility** - Existing deployment preservation, API endpoint functionality

## Test Categories

### 1. GitHub Actions Workflow Validation (`workflow-validation.test.ts`)

Validates the three deployment workflows:

- **`deploy-dev.yml`** - Development environment (`dev/*` branches → `api.dev.devpocket.app`)
- **`deploy-beta.yml`** - Beta environment (`beta` branch → `api.beta.devpocket.app`)  
- **`deploy-production.yml`** - Production (`main` branch → `api.devpocket.app`)

**What it tests:**
- YAML syntax correctness
- Environment-specific configurations (namespaces, domains, resources)
- Branch-based triggering logic
- Docker tagging strategies per environment
- Job dependencies and conditional execution
- Secret management and environment protection
- Force deploy functionality

### 2. Kubernetes Manifest Generation (`kubernetes-manifest-validation.test.ts`)

Tests the template system that generates environment-specific Kubernetes manifests.

**What it tests:**
- Template rendering for each environment (dev, beta, prod)
- Environment-specific values (domains, namespaces, resource limits)
- Generated YAML is valid Kubernetes syntax
- Security configurations (security contexts, TLS)
- Resource requirements and limits
- Label and selector consistency
- Environment variable configuration
- Health check configurations

### 3. Deployment Scripts Testing (`deployment-scripts.test.ts`)

Validates the deployment automation scripts with dry-run functionality.

**What it tests:**
- **`generate-manifests.sh`** - Environment-specific manifest generation
- **`cleanup-environments.sh`** - Resource cleanup with proper ordering
- **`rollback-deployment.sh`** - Deployment rollback capabilities

**Features tested:**
- Script permissions and error handling
- Command-line argument parsing
- Dry-run mode functionality
- Environment validation and mapping
- Resource cleanup ordering
- Rollback safety checks

### 4. Semantic Release Configuration (`semantic-release-config.test.ts`)

Validates the automated versioning and release system.

**What it tests:**
- Branch configuration (main, beta, dev/*)
- Conventional commits parsing
- Release rules for different commit types
- Pre-release versioning (beta, dev)
- Plugin configuration and order
- GitHub and NPM integration
- Version calculation simulation

### 5. Multi-Environment Consistency (`multi-environment-consistency.test.ts`)

Ensures proper isolation and consistency across environments.

**What it tests:**
- Namespace separation and naming patterns
- Domain routing configuration
- Resource allocation per environment
- Secret management isolation
- Configuration consistency
- Environment-specific deployment parameters
- Docker tagging strategies
- Health check configurations

### 6. Pipeline Integration Testing (`pipeline-integration.test.ts`)

Simulates end-to-end CI/CD pipeline execution.

**What it tests:**
- Docker build process simulation
- Kubernetes deployment sequence
- Health checks and verification
- Error handling and rollback scenarios
- Resource cleanup after deployment
- Pipeline performance optimization
- Caching strategies

### 7. Backward Compatibility (`backward-compatibility.test.ts`)

Ensures the new pipeline doesn't break existing functionality.

**What it tests:**
- Existing deployment compatibility
- Service mapping preservation
- API endpoint functionality
- Environment variable consistency
- Database schema compatibility
- Docker configuration preservation
- Security configuration maintenance
- Configuration file compatibility

## Running the Tests

### Quick Start

```bash
# Run all CI/CD pipeline tests
./scripts/test-ci-cd-pipeline.sh

# Run essential tests only (faster)
./scripts/test-ci-cd-pipeline.sh --quick

# Run specific test category
./scripts/test-ci-cd-pipeline.sh --pattern "workflow"

# Generate detailed report
./scripts/test-ci-cd-pipeline.sh --report

# Dry run (show what would be tested)
./scripts/test-ci-cd-pipeline.sh --dry-run
```

### Individual Test Categories

```bash
# Run specific test files
pnpm test tests/ci-cd/workflow-validation.test.ts
pnpm test tests/ci-cd/kubernetes-manifest-validation.test.ts
pnpm test tests/ci-cd/deployment-scripts.test.ts
pnpm test tests/ci-cd/semantic-release-config.test.ts
pnpm test tests/ci-cd/multi-environment-consistency.test.ts
pnpm test tests/ci-cd/pipeline-integration.test.ts
pnpm test tests/ci-cd/backward-compatibility.test.ts
```

### Test Runner Options

| Option | Description | Example |
|--------|-------------|---------|
| `--verbose` | Enable verbose output | `./scripts/test-ci-cd-pipeline.sh --verbose` |
| `--quick` | Run essential tests only | `./scripts/test-ci-cd-pipeline.sh --quick` |
| `--pattern` | Run tests matching pattern | `./scripts/test-ci-cd-pipeline.sh --pattern "kubernetes"` |
| `--report` | Generate detailed report | `./scripts/test-ci-cd-pipeline.sh --report` |
| `--dry-run` | Show test plan without execution | `./scripts/test-ci-cd-pipeline.sh --dry-run` |
| `--no-cleanup` | Skip cleanup of temp files | `./scripts/test-ci-cd-pipeline.sh --no-cleanup` |

## Test Environment Setup

### Prerequisites

- **Node.js 18+** - Runtime environment
- **pnpm 8+** - Package manager
- **Bash** - For running shell scripts
- **Git** - For semantic release testing

### Dependencies

The tests use these frameworks and utilities:

- **Jest** - Test framework
- **js-yaml** - YAML parsing and validation
- **Child Process** - Script execution simulation
- **File System APIs** - File and directory validation

### Environment Variables

Tests use mock environment variables and don't require real secrets:

```bash
NODE_ENV=test
JWT_SECRET=test-jwt-secret-key
GOOGLE_CLIENT_ID=fake-google-client-id
GOOGLE_CLIENT_SECRET=fake-google-client-secret
RESEND_API_KEY=fake-resend-api-key
```

## Expected Test Results

### Success Criteria

✅ **All workflows are syntactically valid YAML**
✅ **Environment-specific configurations are correct**
✅ **Manifest templates generate valid Kubernetes resources**
✅ **Deployment scripts execute successfully in dry-run mode**
✅ **Semantic release supports all required branches**
✅ **Multi-environment isolation is properly configured**
✅ **No breaking changes to existing functionality**

### Common Issues and Solutions

#### YAML Syntax Errors
```bash
# Check workflow syntax
yamllint .github/workflows/*.yml
```

#### Missing Template Files
```bash
# Ensure k8s templates exist
ls -la k8s/templates/
```

#### Script Permission Issues
```bash
# Fix script permissions
chmod +x scripts/deployment/*.sh
```

#### Missing Dependencies
```bash
# Install all dependencies
pnpm install --frozen-lockfile
```

## Integration with CI/CD

### In GitHub Actions

Add the test suite to your CI workflow:

```yaml
- name: Test CI/CD Pipeline
  run: ./scripts/test-ci-cd-pipeline.sh --quick --report
```

### Pre-deployment Validation

Run before deploying to any environment:

```bash
# Validate before deployment
./scripts/test-ci-cd-pipeline.sh --pattern "workflow|kubernetes"
```

### Post-implementation Verification

Verify everything works after changes:

```bash
# Full validation suite
./scripts/test-ci-cd-pipeline.sh --verbose --report
```

## Test Reports

When using `--report`, detailed reports are generated in `reports/ci-cd/`:

```
reports/ci-cd/
├── pipeline-test-report-20250804-120000.md
└── ...
```

Report includes:
- Test execution summary
- Pass/fail status for each category
- Detailed failure analysis
- Recommendations for fixes
- Test coverage overview

## Safety Considerations

### Dry-Run Mode

All deployment scripts support dry-run mode:

```bash
# Safe testing without real deployments
./scripts/deployment/generate-manifests.sh -e dev -i test:latest --dry-run
./scripts/deployment/cleanup-environments.sh -e dev --dry-run
./scripts/deployment/rollback-deployment.sh -e dev --dry-run
```

### Mock Data

Tests use mock/test data:
- Fake Docker images (`test:latest`)
- Test namespaces (`temp-*-test`)
- Mock environment variables
- Temporary directories (auto-cleaned)

### No Real Infrastructure

Tests validate configuration and logic without:
- Connecting to real Kubernetes clusters
- Building actual Docker images
- Triggering real deployments
- Modifying production resources

## Maintenance

### Adding New Tests

1. Create test file in `tests/ci-cd/`
2. Add category to `TEST_CATEGORIES` in test runner
3. Update this README
4. Test locally before committing

### Updating Workflows

When modifying `.github/workflows/*.yml`:
1. Run workflow validation tests
2. Check multi-environment consistency
3. Verify backward compatibility
4. Update test expectations if needed

### Script Changes

When modifying deployment scripts:
1. Run deployment script tests
2. Test dry-run functionality
3. Verify error handling
4. Update help text and examples

## Troubleshooting

### Test Failures

1. **Check Prerequisites** - Node.js, pnpm, permissions
2. **Review Output** - Failed tests show specific issues
3. **Run Individual Tests** - Isolate failing categories
4. **Check File Paths** - Ensure all required files exist
5. **Validate YAML** - Use yaml linters for syntax

### Common Patterns

```bash
# Debug specific test
pnpm test tests/ci-cd/workflow-validation.test.ts --verbose

# Check test setup
./scripts/test-ci-cd-pipeline.sh --dry-run --verbose

# Clean and retry
./scripts/test-ci-cd-pipeline.sh --no-cleanup
rm -rf temp-*-test
./scripts/test-ci-cd-pipeline.sh
```

## Contributing

When contributing to the CI/CD pipeline:

1. **Run Tests First** - Ensure current tests pass
2. **Add Tests** - For new functionality
3. **Update Documentation** - Keep README current
4. **Test All Environments** - dev, beta, production
5. **Verify Backward Compatibility** - No breaking changes

## Security

### Test Security

- Tests don't expose real secrets
- Mock data only in test environments
- Temporary files are cleaned up
- No network calls to production systems

### Pipeline Security

- Environment-specific secrets isolation
- Proper RBAC for deployment
- TLS configuration validation
- Security context enforcement
- Secret management best practices

---

For questions or issues with the CI/CD pipeline tests, please create an issue in the repository or contact the DevOps team.
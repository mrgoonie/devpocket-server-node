# Task Completion Checklist - DevPocket Server

## Before Every Commit
### 1. Code Quality Checks
```bash
# Type checking
pnpm run check-types

# Linting (fix automatically)
pnpm run lint:fix

# Code formatting
pnpm run format
```

### 2. Testing
```bash
# Run all tests
pnpm test

# Ensure all tests pass
# Check test coverage if needed
pnpm run test:coverage
```

### 3. Database Operations (if schema changed)
```bash
# Generate Prisma client
pnpm run db:generate

# Create migration (if needed)
pnpm run db:migrate

# Test migration in development
pnpm run db:push
```

## After Major Changes

### 4. Build Verification
```bash
# Ensure production build works
pnpm run build

# Test production start
pnpm start
```

### 5. Docker Testing (if containerization changed)
```bash
# Build Docker image
pnpm run docker:build

# Test Docker container
pnpm run docker:run
```

### 6. API Documentation (if endpoints changed)
- Verify Swagger docs are updated
- Test API endpoints manually
- Check response schemas are correct

## Security & Performance Checks

### 7. Security Review
- No hardcoded secrets in code
- Proper input validation with Zod
- Authentication middleware applied
- Rate limiting configured appropriately

### 8. Error Handling
- All async functions wrapped in try-catch
- Proper error types used (ValidationError, etc.)
- Structured logging with context
- No sensitive data in error messages

### 9. Performance Considerations
- Database queries optimized (no N+1 problems)
- Proper indexing on database queries
- Connection pooling configured
- Rate limiting for resource-intensive operations

## Documentation Requirements

### 10. Code Documentation
- JSDoc comments for complex functions
- README updated if new features added
- API documentation in Swagger format
- Environment variables documented

### 11. Commit Standards
```bash
# Use conventional commits
feat: add new environment template support
fix: resolve kubeconfig decryption issue
docs: update API documentation
test: add unit tests for auth service
refactor: optimize database queries
chore: update dependencies
```

## Deployment Readiness (Production)

### 12. Environment Configuration
- All required environment variables set
- Secrets properly encrypted
- Database migrations applied
- Template data loaded

### 13. Health Checks
- `/health` endpoint responding
- Database connectivity verified
- Kubernetes connection tested
- WebSocket functionality verified

## Final Verification Checklist
- [ ] Code compiles without errors
- [ ] All tests pass
- [ ] Linting passes
- [ ] Formatting applied
- [ ] Database schema up to date
- [ ] API documentation current
- [ ] No hardcoded secrets
- [ ] Error handling comprehensive
- [ ] Logging appropriately structured
- [ ] Security measures in place

## Emergency Rollback Preparation
- Database migration rollback plan
- Previous Docker image tagged
- Configuration backup available
- Monitoring alerts configured
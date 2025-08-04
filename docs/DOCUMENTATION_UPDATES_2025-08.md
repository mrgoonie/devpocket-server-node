# Documentation Updates - August 2025

This document summarizes all documentation updates made to ensure alignment with the current codebase implementation.

## Files Updated

### 1. API_ENDPOINTS.md
**Changes Made:**
- Fixed login endpoint to use `usernameOrEmail` field instead of separate `email` field
- Marked Google OAuth endpoint as "Coming Soon" since it's not yet implemented
- Added missing Users API section with all endpoints:
  - GET /api/v1/users/me (profile)
  - PUT /api/v1/users/me (update profile)
  - POST /api/v1/users/change-password (fixed from /me/change-password)
  - GET /api/v1/users/me/stats (new)
  - DELETE /api/v1/users/me (account deletion)
- Updated Environment Object to include new fields:
  - webPort - for web-based environments
  - kubernetes_namespace, kubernetes_pod_name, kubernetes_service_name
  - cpu_usage, memory_usage, storage_usage (resource metrics)
  - last_activity_at (instead of last_activity)
- Added missing response objects:
  - Terminal Session Object
  - Environment Log Object
  - User Stats Response
- Fixed registration endpoint to use `fullName` instead of `full_name`

### 2. CLAUDE.md
**Changes Made:**
- Updated implementation details to reflect TypeScript/Node.js architecture (was referencing Python)
- Corrected authentication flow details to match actual implementation
- Updated environment management to reflect Kubernetes integration
- Fixed WebSocket architecture description to match current implementation
- Added database details using PostgreSQL with Prisma ORM
- Updated configuration section to reference TypeScript instead of Pydantic

## Key Findings

### Implemented but Undocumented Features:
1. User statistics endpoint providing environment counts and activity metrics
2. Terminal session tracking with tmux integration
3. Environment resource usage metrics (CPU, memory, storage)
4. Kubernetes integration details in environment objects
5. Account soft-delete functionality with data anonymization

### Planned but Not Implemented:
1. Google OAuth authentication (endpoint exists but commented out)
2. Email change functionality (mentioned in docs but requires separate secure flow)

### Database Schema Enhancements:
- Added tracking for failed login attempts and account lockout
- Terminal sessions now tracked with tmux session names
- Environment logs and metrics stored separately
- User cluster relationships for multi-cluster support

## Recommendations

1. **Complete Google OAuth Implementation**: The endpoint is documented but not implemented. Either implement it or remove from docs until ready.

2. **Add API Versioning Strategy**: Consider documenting the API versioning approach for future updates.

3. **Document Rate Limiting Details**: While mentioned, specific rate limits per endpoint type could be documented.

4. **Add WebSocket Connection Examples**: The WebSocket implementation is comprehensive but could benefit from more code examples.

5. **Create Migration Guide**: As the API evolves, consider creating a migration guide for breaking changes.

## Validation Checklist

- [x] All implemented endpoints are documented
- [x] Response objects match database schema
- [x] Authentication requirements are accurate
- [x] WebSocket endpoints and message formats are documented
- [x] Error response formats are consistent
- [x] Rate limiting information is included
- [x] All user-facing features are documented

## Infrastructure Updates - August 2025

### Kubernetes Authentication Enhancement
**Date:** August 4, 2025

**Changes Made:**
- Implemented hybrid Kubernetes authentication strategy for improved security
- Added support for in-cluster service account authentication as primary method
- Maintained backward compatibility with external kubeconfig fallback
- Enhanced SSL certificate verification for all Kubernetes API connections
- Created comprehensive RBAC manifests with minimal required permissions
- Added comprehensive test suite covering authentication, security, and compatibility scenarios

**Impact on API:**
- No changes to user-facing API endpoints
- Improved security and reliability of environment provisioning
- Better error handling for Kubernetes operations
- Enhanced logging for operational visibility

**Files Updated:**
- `src/services/kubernetes.ts` - Core authentication logic
- `k8s/rbac/` - Complete RBAC manifest files
- `k8s/deploy-rbac.sh` - Enhanced deployment script
- Added comprehensive test suites in `src/services/__tests__/`

## Next Steps

1. Review and implement Google OAuth if needed
2. Consider adding OpenAPI/Swagger spec generation from code
3. Add more detailed examples for complex endpoints
4. Create a changelog for API updates
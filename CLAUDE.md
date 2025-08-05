# DevPocket API Server

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DevPocket Server is a production-ready Node.js ExpressJS backend for a mobile-first cloud IDE. It provides secure, scalable development environments accessible from mobile devices. The system manages user authentication, development environments (containers), and real-time terminal access via WebSockets.

## Tmux Session Management

The application now uses tmux for persistent terminal sessions in development environments:

**Session Architecture**: Each environment runs a tmux session that persists across WebSocket disconnections and container restarts (via persistent volumes).

**Session Lifecycle**:
- Sessions are created when environments start and stored with format `devpocket_{environment_id}`
- Multiple WebSocket connections can attach to the same session
- Sessions persist in `/home/devpocket/.tmux/` on persistent storage
- Automatic session recovery on reconnection

**ConfigMap-based Initialization**: Startup scripts are now stored in Kubernetes ConfigMaps instead of deployment commands, preventing pod crashes from script errors.

**Template Management**: Templates are now stored as YAML files in `./scripts/templates/` and can be loaded into the database using `scripts/load_templates.py`.

## Development Commands

### Docker Development
```bash
# Quick start with provided script
./start.sh

# Manual Docker commands
docker-compose build
docker-compose up -d

# View logs
docker-compose logs -f devpocket-api

# Scale API instances
docker-compose up -d --scale devpocket-api=3

# Restart specific service
docker-compose restart devpocket-api
```

### Multi-Environment CI/CD Pipeline

This project uses an enhanced CI/CD pipeline with semantic release and multi-environment deployments:

#### Environment Configuration

- **Development**: `dev/*` branches → `api.dev.devpocket.app`
- **Beta**: `beta` branch → `api.beta.devpocket.app`
- **Production**: `main` branch → `api.devpocket.app`

#### Release Management

The project uses [semantic-release](https://semantic-release.gitbook.io/semantic-release/) for automated versioning:

```bash
# Check what the next version would be (dry run)
pnpm release:dry

# Create a new release (happens automatically in CI)
pnpm release
```

#### Commit Message Format

Follow [Conventional Commits](https://conventionalcommits.org/) for automatic version bumping:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `perf:` - Performance improvements (patch version bump)
- `chore:`, `docs:`, `style:`, `refactor:`, `test:` - No version bump

#### Automated Deployment Process

**Development Deployments** (`dev/*` branches):
- Fast deployment with development optimizations
- Debug logging enabled
- Reduced resource limits
- Image tags: `dev-latest`, `dev-{branch}-{run-number}-{sha}`

**Beta Deployments** (`beta` branch):
- Semantic versioning with pre-release tags
- Full test suite execution
- Pre-production environment testing
- Image tags: `beta-latest`, `beta-{version}`

**Production Deployments** (`main` branch):
- Full semantic release process
- Production optimizations and resource limits
- Health checks and smoke tests
- Image tags: `latest`, `v{semantic-version}`

The deployment workflow:
1. Runs comprehensive tests
2. Performs semantic release (all environments now use semantic versioning)
3. Builds and tags Docker images with semantic versions
4. Pushes images to Docker Hub with multiple tags (latest + semantic version)
5. Deploys to environment-specific namespaces using generated manifests
6. Runs health checks and smoke tests
7. Provides rollback capabilities

#### Docker Image Tagging Strategy

All environments now use semantic-release for consistent versioning:

- **Production**: `digitop/devpocket-nodejs:latest`, `digitop/devpocket-nodejs:v1.2.3` (semantic version)
- **Beta**: `digitop/devpocket-nodejs:beta-latest`, `digitop/devpocket-nodejs:beta-1.2.3-beta.1` (semantic pre-release)
- **Dev**: `digitop/devpocket-nodejs:dev-latest`, `digitop/devpocket-nodejs:dev-0.0.0-dev.branch.123` (generated dev version)

#### Deployment Management Scripts

The project includes several deployment management scripts in `scripts/deployment/`:

```bash
# Generate environment-specific manifests
./scripts/deployment/generate-manifests.sh -e dev -i digitop/devpocket-nodejs:dev-latest

# Cleanup environment deployments
./scripts/deployment/cleanup-environments.sh -e dev -d  # dry run
./scripts/deployment/cleanup-environments.sh -e beta -f # force cleanup

# Rollback deployments
./scripts/deployment/rollback-deployment.sh -e prod -r 3  # rollback to revision 3
```

## Important Implementation Details

**Authentication Flow**: JWT tokens are generated using `jwtService.generateTokenPair()` and validated in `middleware/auth.ts`. Google OAuth is planned but not yet implemented.

**Environment Management**: Environments are Kubernetes deployments managed through the `KubernetesService`. Each environment gets its own namespace, persistent volume claim, and service.

**WebSocket Architecture**: WebSocket connections are handled in `services/websocket.ts` with support for terminal and logs endpoints. Sessions are tracked using tmux for persistence across reconnections.

**Database**: Using PostgreSQL with Prisma ORM. Key models include User, Environment, Template, Cluster, and TerminalSession. Relationships are properly defined with cascading deletes.

**Resource Limits**: Subscription-based resource allocation is enforced when creating environments based on user's subscription plan (FREE, STARTER, PRO).

**Error Handling**: Global error handlers in `middleware/errorHandler.ts` provide structured error responses. Custom error types (ValidationError, AuthenticationError, etc.) are used for different scenarios.

**Security Features**: Account lockout after 5 failed attempts, rate limiting middleware, Helmet for security headers, CORS configuration, and JWT-based authentication.

## Configuration

Environment variables are managed through `.env` files and TypeScript configuration:
- `DATABASE_URL`: Database connection string
- `SECRET_KEY`: JWT signing key (auto-generated if not provided)
- `GOOGLE_CLIENT_ID/SECRET`: OAuth credentials
- `DEBUG`: Enables detailed error responses and API docs
- `ALLOWED_ORIGINS`: CORS configuration for mobile app domains

## WebSocket Usage

WebSocket endpoints expect authentication via query parameter `token`:
```
ws://localhost:8000/api/v1/ws/terminal/{environment_id}?token=jwt_token
```

Message format is JSON with `type` field:
- `{"type": "input", "data": "command\n"}` - Terminal input
- `{"type": "resize", "cols": 80, "rows": 24}` - Terminal resize
- `{"type": "ping"}` - Keepalive (responds with pong)

## Production Deployment

The application includes production-ready Docker configuration with:
- Multi-stage builds for smaller images
- Non-root user execution
- Health checks for orchestrators
- Nginx reverse proxy with rate limiting
- PostgreSQL with authentication and indexing
- Redis for caching and rate limiting

## Development rules

- ask questions for clarification of uncleared requests
- always update the related docs in `./docs` folder if the code changes affect the docs
- use `pnpm` (alias `p`) for package management and node runtime (not `npm`)
- use try-catch handler
- comprehensive log management- follow security best practices
- focus on human-readable & developer-friendly when writing code
- commit code along the way after every stage, make sure type check and code format are executed before committing
- update `README.md`, `CLAUDE.md` and developer docs (in `./docs`) along the way
- use `context7` mcp tools for reading latest docs if needed
- use `kubernetes` and `postgresql` mcp tools to diagnose and verify if needed
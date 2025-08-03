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

### Release Management

This project uses [semantic-release](https://semantic-release.gitbook.io/semantic-release/) for automated versioning and releases.

```bash
# Check what the next version would be (dry run)
semantic-release version --noop --print

# Create a new release locally (for testing)
semantic-release version

# Preview changelog for next version
semantic-release changelog --unreleased
```

#### Commit Message Format

Follow [Conventional Commits](https://conventionalcommits.org/) for automatic version bumping:

- `feat:` - New features (minor version bump)
- `fix:` - Bug fixes (patch version bump)
- `perf:` - Performance improvements (patch version bump)
- `chore:`, `docs:`, `style:`, `refactor:`, `test:` - No version bump

#### Automated Release Process

Releases are automatically created when commits are pushed to:
- `main` branch - Creates production releases
- `beta/*` branches - Creates pre-release versions with `-beta` suffix

The release workflow:
1. Analyzes commit messages since last release
2. Determines next version number using semantic versioning
3. Updates version in `package.json`
4. Generates/updates `CHANGELOG.md`
5. Creates Git tag and GitHub release
6. Builds and deploys Docker image to production (main branch only)

## Important Implementation Details

**Authentication Flow**: JWT tokens are created in `auth_service.create_tokens()` and validated in `middleware.auth.get_current_user()`. Google OAuth uses `google.auth` library for token verification.

**Environment Management**: Environments are simulated containers with lifecycle management. The actual container creation is stubbed in `environment_service._create_container()` - this would integrate with Kubernetes in production.

**WebSocket Architecture**: WebSocket connections are managed through `WebSocketConnectionManager` with rate limiting per user. Terminal sessions are tracked in database and memory for cleanup.

**Database Indexes**: Critical indexes are created in `database.create_indexes()` for users (email, username), environments (user_id, status), and metrics (time-series data with TTL).

**Resource Limits**: Subscription-based resource allocation is enforced in `environment_service._get_default_resources()` and `_check_user_limits()`.

**Error Handling**: Global exception handlers in `server.ts` provide structured error responses. HTTPExceptions are used for expected errors, with detailed logging for debugging.

**Security Features**: Account lockout after 5 failed attempts, rate limiting middleware, security headers, CORS configuration, and non-root container execution.

## Configuration

Environment variables are managed through `.env` files and Pydantic Settings:
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
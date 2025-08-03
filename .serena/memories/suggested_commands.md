# DevPocket Server - Essential Commands

## Package Management (REQUIRED: Use pnpm, NOT npm)
```bash
# Install dependencies
pnpm install

# Install development dependencies
pnpm install -D <package>

# Add production dependency
pnpm add <package>
```

## Development Commands
```bash
# Start development server with hot reload
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start

# Watch mode with file changes
pnpm run dev
```

## Code Quality & Formatting
```bash
# Run ESLint
pnpm run lint

# Fix ESLint issues automatically
pnpm run lint:fix

# Format code with Prettier
pnpm run format

# Type checking without compilation
pnpm run check-types
```

## Database Operations (Prisma)
```bash
# Generate Prisma client (after schema changes)
pnpm run db:generate

# Create and apply database migration
pnpm run db:migrate

# Push schema changes (dev only, no migration)
pnpm run db:push

# Open database GUI
pnpm run db:studio

# Seed database with test data
pnpm run db:seed

# Production database operations
pnpm run db:push:prod
pnpm run db:migrate:prod
pnpm run db:seed:prod
```

## Testing
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Generate test coverage report
pnpm run test:coverage

# Run only unit tests
pnpm run test:unit

# Unit tests in watch mode
pnpm run test:unit:watch
```

## Docker Operations
```bash
# Quick start (recommended)
./start.sh

# Quick start with tools (Adminer, Redis Commander)
./start.sh --with-tools

# Build Docker image
pnpm run docker:build

# Run Docker container
pnpm run docker:run

# Docker Compose operations
docker-compose up -d
docker-compose logs -f devpocket-api
docker-compose down
```

## Template Management
```bash
# Load templates from YAML files
pnpm run templates:load
```

## Release Management (Semantic Release)
```bash
# Check what next version would be (dry run)
pnpm run release:dry

# Create release (automated in CI/CD)
pnpm run release
```

## Useful System Commands
```bash
# Git operations
git status
git add .
git commit -m "feat: description"
git push

# File operations
ls -la
find . -name "*.ts" -type f
grep -r "searchterm" src/

# Process management
ps aux | grep node
kill -9 <pid>
```

## Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
# or
vim .env
```

## Debugging
```bash
# View application logs
tail -f logs/app.log

# View Docker container logs
docker logs -f <container-name>

# Database connection test
pnpm run test:db-connection
```

## Important Notes
- **ALWAYS use pnpm** instead of npm or yarn
- **Run tests** before committing code
- **Format code** with prettier before committing
- **Generate Prisma client** after schema changes
- **Use TypeScript strict mode** - fix all type errors
# DevPocket Server - Tech Stack & Code Conventions

## Tech Stack
- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm (required, NOT npm)
- **Framework**: Express.js with middleware
- **Database**: PostgreSQL with Prisma ORM
- **Validation**: Zod schemas
- **Authentication**: JWT + Google OAuth
- **Container Orchestration**: Kubernetes
- **WebSockets**: ws library
- **Testing**: Jest with supertest
- **Linting**: ESLint + Prettier
- **Build**: TypeScript compiler (tsc)

## Code Style & Conventions

### TypeScript Standards
- **Strict TypeScript** configuration enabled
- **Type annotations** required for function returns
- **Interface/Type definitions** in `/src/types/`
- **No `any` types** (use unknown or proper typing)
- **Async/await** preferred over Promises
- **Optional chaining** (`?.`) used extensively

### Naming Conventions
- **Files**: kebab-case (`user-service.ts`, `auth-middleware.ts`)
- **Variables/Functions**: camelCase (`createEnvironment`, `userId`)
- **Classes**: PascalCase (`KubernetesService`, `ValidationError`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ENVIRONMENTS`, `JWT_SECRET`)
- **Database Models**: PascalCase (`Environment`, `User`)

### File Structure
```
src/
├── routes/          # Express route handlers
├── services/        # Business logic services
├── middleware/      # Express middleware
├── utils/           # Utility functions
├── types/           # TypeScript type definitions
├── config/          # Configuration files
└── prisma/          # Database schema and migrations
```

### Error Handling
- **Custom Error Classes** in `/src/types/errors.ts`
- **asyncHandler** wrapper for route handlers
- **Global error middleware** in `/src/middleware/errorHandler.ts`
- **Structured logging** with context information
- **Try-catch blocks** around all async operations

### API Design
- **RESTful endpoints** with proper HTTP verbs
- **Zod validation** for request bodies
- **Swagger/OpenAPI** documentation for all endpoints
- **JWT authentication** via Bearer tokens
- **Consistent response formats** with status codes
- **Rate limiting** on sensitive endpoints

### Database Patterns
- **Prisma ORM** for all database operations
- **Transaction support** for multi-table operations
- **Soft deletes** via status fields (not hard deletes)
- **Pagination** with limit/offset parameters
- **Database migrations** via Prisma CLI
- **Seeding scripts** for development data

### Security Practices
- **bcrypt** for password hashing (12 rounds)
- **JWT tokens** with configurable expiration
- **Rate limiting** (100 req/min global, 5 req/min auth)
- **Input validation** via Zod schemas
- **CORS configuration** for allowed origins
- **Helmet** for security headers
- **Account lockout** after failed attempts
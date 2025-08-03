# DevPocket Server - Codebase Structure

## Root Directory Structure
```
devpocket-server-node/
├── src/                    # Source code
├── prisma/                 # Database schema and migrations
├── tests/                  # Test files
├── scripts/                # Utility scripts
├── docs/                   # Documentation
├── k8s/                    # Kubernetes manifests
├── .github/                # GitHub Actions workflows
├── docker-compose.yaml     # Docker development setup
├── Dockerfile             # Container build instructions
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── .eslintrc.js           # ESLint configuration
├── prettier.config.js     # Prettier configuration
└── .env.example           # Environment variables template
```

## Source Code Structure (`src/`)
```
src/
├── routes/                 # Express route handlers
│   ├── auth.ts            # Authentication endpoints
│   ├── environments.ts    # Environment management
│   ├── templates.ts       # Template management
│   ├── users.ts           # User management
│   ├── clusters.ts        # Cluster management
│   └── health.ts          # Health check endpoints
│
├── services/               # Business logic layer
│   ├── kubernetes.ts      # K8s cluster management
│   ├── websocket.ts       # WebSocket handling
│   ├── email.ts           # Email service
│   └── __mocks__/         # Service mocks for testing
│
├── middleware/             # Express middleware
│   ├── auth.ts            # JWT authentication
│   ├── errorHandler.ts    # Global error handling
│   └── rateLimiter.ts     # Rate limiting
│
├── utils/                  # Utility functions
│   ├── encryption.ts      # Data encryption/decryption
│   ├── jwt.ts             # JWT token management
│   ├── kubeconfig.ts      # Kubernetes config parsing
│   └── password.ts        # Password hashing
│
├── types/                  # TypeScript type definitions
│   ├── api.ts             # API request/response types
│   └── errors.ts          # Custom error classes
│
├── config/                 # Configuration files
│   ├── database.ts        # Prisma client setup
│   ├── env.ts             # Environment validation
│   └── logger.ts          # Winston logger setup
│
├── scripts/                # Utility scripts
│   ├── templates/         # YAML template definitions
│   ├── load_templates.ts  # Template loading script
│   └── test_*.ts          # Testing utilities
│
├── prisma/                 # Database related
│   └── seed.ts            # Database seeding
│
├── app.ts                  # Express app setup
└── index.ts               # Application entry point
```

## Database Structure (Prisma Models)
```
Models:
├── User                    # User accounts and authentication
├── Environment            # Development environments
├── Template               # Environment templates
├── Cluster                # Kubernetes clusters
├── UserClusterAccess      # User permissions for clusters
├── TerminalSession        # Terminal session tracking
├── EnvironmentMetric      # Resource usage metrics
└── UserSession            # Authentication sessions
```

## Key Files & Their Purposes

### Core Application
- **`src/index.ts`**: Application entry point, server startup
- **`src/app.ts`**: Express app configuration, middleware setup
- **`src/config/env.ts`**: Environment variable validation with Zod

### Authentication & Security
- **`src/middleware/auth.ts`**: JWT authentication middleware
- **`src/utils/jwt.ts`**: JWT token creation and validation
- **`src/utils/encryption.ts`**: AES encryption for sensitive data
- **`src/utils/password.ts`**: bcrypt password hashing

### Kubernetes Integration
- **`src/services/kubernetes.ts`**: Main K8s service class
- **`src/utils/kubeconfig.ts`**: Kubeconfig parsing utilities
- **`src/routes/environments.ts`**: Environment lifecycle API

### Real-time Communication
- **`src/services/websocket.ts`**: WebSocket server implementation
- **Terminal WebSocket**: `/api/v1/ws/terminal/{environment_id}`
- **Logs WebSocket**: `/api/v1/ws/logs/{environment_id}`

### Database Layer
- **`prisma/schema.prisma`**: Database schema definition
- **`src/prisma/seed.ts`**: Development data seeding
- **`src/config/database.ts`**: Prisma client configuration

### Template System
- **`src/scripts/templates/`**: YAML template definitions
  - `nodejs.yaml`, `python.yaml`, `ubuntu.yaml`, etc.
- **`src/scripts/load_templates.ts`**: Template loading utility

## API Structure
```
/api/v1/
├── /auth              # Authentication endpoints
├── /users             # User management
├── /environments      # Environment CRUD operations
├── /templates         # Template management
├── /clusters          # Cluster management
├── /health            # Health checks
├── /docs              # Swagger documentation
└── /ws                # WebSocket endpoints
```

## Testing Structure
```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── api/               # API endpoint tests
├── websocket/         # WebSocket tests
└── fixtures/          # Test data and helpers
```

## Configuration Files
- **`.env.example`**: Template for environment variables
- **`tsconfig.json`**: TypeScript compiler configuration
- **`.eslintrc.js`**: ESLint rules and plugins
- **`prettier.config.js`**: Code formatting rules
- **`jest.config.js`**: Testing framework configuration
- **`docker-compose.yaml`**: Development environment setup
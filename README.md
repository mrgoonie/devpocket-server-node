# 📱 DevPocket Server

> **The world's first mobile-native cloud IDE backend**

DevPocket Server is a production-ready Node.js ExpressJS backend that powers the DevPocket mobile-first cloud IDE. It provides secure, scalable development environments accessible from any mobile device.

- **DevPocker Mobile App**: https://github.com/mrgoonie/devpocket-app

## ✨ Features

### 🔐 Authentication & Security
- **JWT Authentication** with secure token management
- **Google OAuth** integration for seamless sign-in
- **Role-based access control** (Free, Starter, Pro, Admin)
- **Rate limiting** and DDoS protection
- **Security headers** and CORS configuration
- **Account lockout** after failed login attempts

### 🖥️ Environment Management
- **Multi-template support** (Python, Node.js, Go, Rust, Ubuntu)
- **Resource limits** based on subscription plans
- **Real-time monitoring** (CPU, memory, storage usage)
- **Environment lifecycle** management (create, start, stop, delete)
- **Persistent storage** for development workspaces

### 🌐 WebSocket Support
- **Real-time terminal access** with tmux session persistence
- **Live log streaming** from containers
- **Connection management** with automatic cleanup
- **Rate limiting** for WebSocket connections
- **Session recovery** after disconnections

### 🎯 Tmux Session Management
- **Persistent terminal sessions** that survive disconnections
- **Multi-client access** to the same session
- **Session state persistence** via persistent volumes
- **Automatic session recovery** on reconnection
- **ConfigMap-based initialization** preventing pod crashes

### 📊 Monitoring & Observability
- **Structured logging** with JSON output
- **Health checks** for Kubernetes deployments
- **Metrics collection** with Prometheus integration
- **Database indexing** for optimal performance

### 🚀 Production Ready
- **Docker containerization** with multi-stage builds
- **Docker Compose** setup with all dependencies
- **Nginx reverse proxy** with SSL termination
- **MongoDB** with replica set support
- **Redis** for caching and session management

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   Mobile App    │────│   Nginx Proxy    │────│  ExpressJS App │
│   (Flutter)     │    │  (Load Balancer) │    │   (Node.js)    │
└─────────────────┘    └──────────────────┘    └────────────────┘
                                                        │
                        ┌──────────────────┐            │
                        │   Environment    │←───────────┤
                        │   Orchestrator   │            │
                        │  (Kubernetes)    │            │
                        └──────────────────┘            │
┌─────────────────┐    ┌──────────────────┐    ┌────────────────┐
│   MongoDB       │────│      Redis       │────│   Prometheus   │
│  (Database)     │    │    (Cache)       │    │  (Metrics)     │
└─────────────────┘    └──────────────────┘    └────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Docker** and **Docker Compose** (required)
- **Node.js 18+** (for local development)
- **pnpm 8+** (package manager)
- **PostgreSQL** (via Docker or local)
- **Redis 7.0+** (via Docker or local)

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/devpocket-server-node.git
cd devpocket-server-node
```

### 2. Quick Start with Docker (Recommended)

**Option A: Using the startup script (easiest)**
```bash
# Basic development environment
./start.sh

# With development tools (Adminer, Redis Commander)
./start.sh --with-tools

# Production-like setup with Nginx
./start.sh --production-like

# Background mode
./start.sh --detached
```

**Option B: Manual Docker Compose**
```bash
# Start all services
docker-compose up -d

# View service status
docker-compose ps

# View logs
docker-compose logs -f devpocket-api
```

### 3. Verify Installation

After starting the services, access:

- **🌐 API Server**: http://localhost:8000
- **📊 Health Check**: http://localhost:8000/api/v1/health
- **📚 API Documentation**: http://localhost:8000/api/v1/docs
- **🗄️ Database Admin** (with `--with-tools`): http://localhost:8080
- **🔴 Redis Commander** (with `--with-tools`): http://localhost:8081

### 4. Environment Configuration

The startup script automatically creates `.env` from `.env.example`. Update as needed:

```env
# Database (Docker defaults)
DATABASE_URL="postgresql://devpocket:devpocket_password@localhost:5432/devpocket_server"

# Security (generate strong keys for production)
SECRET_KEY=your-super-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Application
NODE_ENV=development
DEBUG=true
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Kubernetes (optional for local dev)
CLUSTER_NAME=default-cluster
```

### 5. Database Setup with Prisma

When using Docker, the database is automatically set up. For manual setup:

```bash
# Generate Prisma client
pnpm db:generate

# Create and apply database migrations
pnpm db:migrate

# Seed database with sample data
pnpm db:seed
```

**The seed script creates:**
- **Admin user**: `admin@devpocket.app` / `AdminPassword123!`
- **Demo user**: `demo@devpocket.app` / `DemoPassword123!`  
- **Test user**: `test@devpocket.app` / `TestPassword123!`
- **Default clusters** (OVH Kubernetes)
- **Development templates** (Node.js, Python, Ubuntu)
- **Sample environments** for testing

### 6. Initialize Templates (API)

Alternative to seeding, use the API to initialize templates:

```bash
# Login as admin user first
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"usernameOrEmail": "admin@devpocket.app", "password": "AdminPassword123!"}'

# Use the returned token to initialize templates
curl -X POST http://localhost:8000/api/v1/templates/initialize \
  -H "Authorization: Bearer <admin-token>"
```

## 🔧 Development Setup

### Local Development (without Docker)

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Start Database Services**
   ```bash
   # Start PostgreSQL and Redis only
   docker-compose up -d postgres redis
   ```

3. **Database Setup**
   ```bash
   # Generate Prisma client
   pnpm db:generate
   
   # Run database migrations (creates tables)
   pnpm db:migrate
   
   # Seed database with sample data
   pnpm db:seed
   
   # Open Prisma Studio for database management
   pnpm db:studio
   ```

4. **Run the Application**
   ```bash
   # Development mode with hot reload
   pnpm run dev
   
   # Build for production
   pnpm run build
   
   # Start production server
   pnpm start
   ```

5. **Access the API**
   - **API**: http://localhost:8000
   - **Documentation**: http://localhost:8000/api/v1/docs
   - **Database Studio**: `pnpm db:studio` (http://localhost:5555)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `SECRET_KEY` | *generated* | JWT secret key |
| `GOOGLE_CLIENT_ID` | `None` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | `None` | Google OAuth client secret |
| `NODE_ENV` | `development` | Environment mode |
| `DEBUG` | `true` | Enable debug mode |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS allowed origins |
| `CLUSTER_NAME` | `default-cluster` | Default Kubernetes cluster |

## 🗄️ Database Management with Prisma

### Database Schema

The project uses Prisma ORM with PostgreSQL, featuring:

- **Users**: Authentication, subscriptions, account management
- **Templates**: Environment templates (Node.js, Python, Ubuntu, etc.)
- **Environments**: User development environments with Kubernetes integration
- **Clusters**: Kubernetes cluster management
- **Sessions**: Terminal session tracking with tmux persistence
- **Metrics**: Resource usage monitoring and logging

### Prisma Commands

```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create new migration
pnpm db:migrate

# Push schema changes without migration (dev only)
pnpm db:push

# Open database GUI
pnpm db:studio

# Seed database with sample data
pnpm db:seed

# Reset database (WARNING: destroys all data)
pnpm db:reset
```

### Database Seeding

The seed script (`src/prisma/seed.ts`) creates comprehensive test data:

```bash
pnpm db:seed
```

**Creates:**
- **3 test users** with different subscription levels
- **2 Kubernetes clusters** (default and staging)
- **3 development templates** (Node.js, Python, Ubuntu)
- **User-cluster access mappings**
- **Sample environments** for testing

### Schema Development

1. **Modify** `prisma/schema.prisma`
2. **Generate migration**: `pnpm db:migrate`
3. **Update client**: `pnpm db:generate`
4. **Update TypeScript types** (automatic)

### Production Database

```bash
# Production migration
DATABASE_URL="postgresql://prod..." pnpm db:migrate

# Production seeding (optional)
DATABASE_URL="postgresql://prod..." pnpm db:seed
```

## 📱 API Documentation

### Authentication Endpoints

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/google
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

### Environment Management

```http
GET    /api/v1/environments
POST   /api/v1/environments
GET    /api/v1/environments/{id}
DELETE /api/v1/environments/{id}
POST   /api/v1/environments/{id}/start
POST   /api/v1/environments/{id}/stop
GET    /api/v1/environments/{id}/metrics
```

### WebSocket Endpoints

```http
WS /api/v1/ws/terminal/{environment_id}
WS /api/v1/ws/logs/{environment_id}
```

### Example Usage

#### Register a User

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "developer",
    "email": "dev@example.com",
    "password": "SecurePass123!",
    "full_name": "Developer User"
  }'
```

#### Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username_or_email": "developer",
    "password": "SecurePass123!"
  }'
```

#### Create Environment

```bash
curl -X POST http://localhost:8000/api/v1/environments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-python-env",
    "template": "python"
  }'
```

#### WebSocket Terminal Connection

```javascript
const ws = new WebSocket('ws://localhost:8000/api/v1/ws/terminal/env-123?token=your-jwt-token');

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Terminal output:', data);
};

// Send terminal input
ws.send(JSON.stringify({
    type: 'input',
    data: 'ls -la
'
}));

// Resize terminal (tmux session)
ws.send(JSON.stringify({
    type: 'resize',
    cols: 80,
    rows: 24
}));

// Ping for keepalive
ws.send(JSON.stringify({
    type: 'ping'
}));
```

**Tmux Session Benefits:**
- Sessions persist across WebSocket disconnections
- Multiple clients can connect to the same session
- Session state is preserved in persistent volumes
- Automatic session recovery when reconnecting

## 🐳 Docker Deployment

### Local Development with Docker Compose

```bash
# Build and start all services
docker-compose -f docker-compose.yaml up -d

# Scale API instances
docker-compose up -d --scale devpocket-api=3

# Update containers
docker-compose pull
docker-compose up -d
```

### Production Kubernetes Deployment

The project includes comprehensive Kubernetes manifests and automated CI/CD:

```bash
# Quick deployment
./scripts/deploy.sh

# Deploy specific version
./scripts/deploy.sh v1.2.3

# Update secrets
./scripts/update-secrets.sh
```

#### Automated Deployment
- **GitHub Actions**: Automatic build and deploy on push to `main`
- **Docker Registry**: `digitop/devpocket-api` on Docker Hub
- **Versioning**: Semantic versioning with Git tags
- **Health Checks**: Automated readiness and liveness probes
- **Scaling**: Horizontal Pod Autoscaler (3-10 replicas)

See [k8s/README.md](k8s/README.md) for detailed Kubernetes deployment guide.

## 🔒 Security Best Practices

### Implemented Security Measures

1. **Authentication & Authorization**
   - JWT tokens with configurable expiration
   - Google OAuth integration
   - Role-based access control
   - Account lockout after failed attempts

2. **API Security**
   - Rate limiting (100 req/min global, 5 req/min auth)
   - Request size limits (10MB)
   - CORS configuration
   - Security headers (CSP, HSTS, etc.)

3. **Data Protection**
   - Password hashing with bcrypt
   - Secure token generation
   - Database input validation
   - Environment variable secrets

4. **Infrastructure Security**
   - Non-root container user
   - Network isolation
   - Health checks
   - Graceful shutdown handling

### Security Recommendations

1. **Production Secrets**
   ```bash
   # Generate secure secret key
   python -c "import secrets; print(secrets.token_urlsafe(32))"

   # Use environment variables for all secrets
   export SECRET_KEY="your-secure-key"
   export GOOGLE_CLIENT_SECRET="your-oauth-secret"
   ```

2. **Database Security**
   ```bash
   # Enable PostgreSQL authentication
   DATABASE_URL="postgresql://username:password@localhost:5432/devpocket"
   ```

3. **SSL/TLS Configuration**
   ```nginx
   server {
       listen 443 ssl http2;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       # ... additional SSL configuration
   }
   ```

## 📊 Monitoring & Observability

### Health Checks

- **Health**: `GET /health` - Basic service health
- **Readiness**: `GET /health/ready` - Database connectivity
- **Liveness**: `GET /health/live` - Service responsiveness

### Logging

Structured logging with configurable formats

### Metrics

Built-in metrics collection for:
- Request counts and latencies
- Database connection pools
- Environment resource usage
- WebSocket connections
- Error rates

### Prometheus Integration

```yaml
# Add to docker-compose.yaml
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
```

### Application Optimization

1. **Async/Await**
   - All I/O operations are asynchronous
   - Non-blocking database calls
   - Concurrent request handling

2. **Caching**
   - Redis for session storage
   - In-memory rate limiting
   - Connection pooling

3. **Resource Limits**
   ```yaml
   # Container resource limits
   resources:
     limits:
       memory: "512Mi"
       cpu: "500m"
     requests:
       memory: "256Mi"
       cpu: "250m"
   ```

## 🧪 Testing Guide

### Test Categories

The project includes comprehensive testing across multiple layers:

- **Unit Tests**: Individual function and service testing
- **Integration Tests**: Database and service integration  
- **API Tests**: HTTP endpoint testing with authentication
- **WebSocket Tests**: Real-time connection testing
- **Environment Integration Tests**: Full Kubernetes workflow testing

### Running Tests

#### Quick Test Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage

# Run only unit tests
pnpm test:unit

# Run unit tests in watch mode
pnpm test:unit:watch

# Unit test coverage
pnpm test:unit:coverage
```

#### Test Environment Setup

1. **Automated Setup** (Recommended)
   ```bash
   # Tests automatically start test database containers
   pnpm test
   ```

2. **Manual Setup**
   ```bash
   # Start test databases
   docker-compose -f docker-compose.test.yml up -d
   
   # Run tests
   TEST_DATABASE_URL="postgresql://test:test@localhost:5433/devpocket_test" pnpm test
   ```

### Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── services/           # Service layer tests
│   ├── utils/              # Utility function tests
│   └── middleware/         # Middleware tests
├── integration/            # Integration tests
│   ├── database/           # Database integration
│   ├── auth/              # Authentication flow
│   └── kubernetes/         # K8s service tests
├── api/                    # API endpoint tests
│   ├── auth.test.ts       # Authentication endpoints
│   ├── environments.test.ts # Environment management
│   ├── templates.test.ts   # Template endpoints
│   └── users.test.ts      # User management
├── websocket/             # WebSocket tests
│   ├── terminal.test.ts   # Terminal WebSocket
│   └── logs.test.ts       # Log streaming
└── fixtures/              # Test data and mocks
    ├── users.json
    ├── templates.json
    └── environments.json
```

### Example Test Cases

#### Unit Test Example
```typescript
// tests/unit/services/auth.test.ts
import { authService } from '@/services/auth';
import { prisma } from '@/config/database';

describe('AuthService', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it('should create user with valid credentials', async () => {
    const userData = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'SecurePass123!',
      fullName: 'Test User'
    };

    const user = await authService.createUser(userData);
    
    expect(user.email).toBe(userData.email);
    expect(user.password).toBeUndefined(); // Password should not be returned
  });
});
```

#### API Test Example  
```typescript
// tests/api/environments.test.ts
import request from 'supertest';
import { app } from '@/index';
import { createTestUser, getAuthToken } from '../fixtures/auth';

describe('GET /api/v1/environments', () => {
  let authToken: string;

  beforeEach(async () => {
    const user = await createTestUser();
    authToken = await getAuthToken(user.id);
  });

  it('should return user environments', async () => {
    const response = await request(app)
      .get('/api/v1/environments')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('environments');
    expect(response.body.environments).toBeInstanceOf(Array);
  });
});
```

#### WebSocket Test Example
```typescript
// tests/websocket/terminal.test.ts
import WebSocket from 'ws';
import { getAuthToken } from '../fixtures/auth';

describe('WebSocket Terminal', () => {
  it('should establish terminal connection', async () => {
    const token = await getAuthToken('test-user-id');
    const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/terminal/env-123?token=${token}`);
    
    return new Promise((resolve) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'input', data: 'echo "hello"\n' }));
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('output');
        ws.close();
        resolve(undefined);
      });
    });
  });
});
```

### Testing Best Practices

#### Database Testing
```bash
# Each test runs in isolation with clean database
beforeEach(async () => {
  await prisma.$transaction([
    prisma.environment.deleteMany(),
    prisma.user.deleteMany(),
  ]);
});
```

#### Authentication Testing
```typescript
// Helper for authenticated requests
const authenticatedRequest = (method: 'get' | 'post' | 'put' | 'delete') => {
  return request(app)[method]
    .set('Authorization', `Bearer ${authToken}`)
    .set('Content-Type', 'application/json');
};
```

#### Environment Variable Testing
```bash
# Test environment variables (automatically set)
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5433/devpocket_test
REDIS_URL=redis://localhost:6380
SECRET_KEY=test-secret-key
```

### Continuous Integration

Tests run automatically on:
- **Pull Requests**: Full test suite
- **Push to main**: Full test suite + deployment tests
- **Nightly**: Extended integration tests

#### GitHub Actions Pipeline
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm test:coverage
```

### Coverage Reports

View detailed coverage reports:
```bash
# Generate and view coverage
pnpm test:coverage

# Coverage is generated in coverage/ directory
open coverage/lcov-report/index.html
```

**Target Coverage**:
- **Overall**: >90%
- **Critical paths** (auth, environments): >95%
- **Utilities**: >85%

### Debugging Tests

```bash
# Run specific test file
pnpm test tests/api/auth.test.ts

# Run tests matching pattern
pnpm test --testNamePattern="should create user"

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest tests/api/auth.test.ts
```

## 🤝 Contributing

### Development Workflow

1. **Fork & Clone**
   ```bash
   git clone <your-fork-url>
   cd devpocket-server
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```

3. **Install Development Dependencies**
   ```bash
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

4. **Make Changes & Test**
   ```bash
   pytest
   black app/  # Code formatting
   flake8 app/ # Linting
   ```

5. **Commit & Push**
   ```bash
   git commit -m "Add amazing feature"
   git push origin feature/amazing-feature
   ```

6. **Create Pull Request**

### Code Style

- **Black** for code formatting
- **Flake8** for linting
- **Type hints** for all functions
- **Docstrings** for public methods
- **Async/await** for I/O operations

### Commit Convention

```
feat: add user authentication
fix: resolve database connection issue
docs: update API documentation
test: add environment tests
refactor: optimize database queries
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Documentation

- **API Docs**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Architecture**: See `docs/` folder

### Getting Help

1. **Issues**: Create a GitHub issue for bugs
2. **Discussions**: Use GitHub Discussions for questions
3. **Discord**: Join our developer community
4. **Email**: support@devpocket.io

## 🚀 Roadmap

### v1.1 (Completed)
- [ ] JWT Authentication
- [ ] Google OAuth
- [ ] Environment Management
- [ ] WebSocket Terminal
- [ ] Docker Deployment

### v1.2 (Current - Tmux Architecture)
- [ ] Kubernetes Integration
- [ ] Tmux Session Management
- [ ] ConfigMap-based Initialization
- [ ] Persistent Terminal Sessions
- [ ] Integration Testing Suite
- [ ] YAML-based Template System
- [ ] File Upload/Download
- [ ] Environment Sharing

### v1.3 (Next)
- [ ] Usage Analytics
- [ ] API Rate Limiting Per User
- [ ] Enhanced Session Recovery
- [ ] Multi-window Tmux Support

### v2.0 (Future)
- [ ] Multi-region Deployment
- [ ] Environment Templates Store
- [ ] AI-powered Code Assistance
- [ ] Team Collaboration Features
- [ ] Advanced Monitoring Dashboard

---

**Built with ❤️ for the mobile-first developer community**

*DevPocket - Code Anywhere In Your Pocket* 📱💻

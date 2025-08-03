import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { loadConfig, getConfig } from '@/config/env';
import logger from '@/config/logger';
import db from '@/config/database';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { defaultRateLimiter } from '@/middleware/rateLimiter';

// Import routes
import healthRoutes from '@/routes/health';
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import environmentRoutes from '@/routes/environments';
import templateRoutes from '@/routes/templates';
import clusterRoutes from '@/routes/clusters';

// Load configuration
loadConfig();
const config = getConfig();

const app: express.Application = express();

// Trust proxy (for load balancers)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: { action: 'deny' }, // Set X-Frame-Options to DENY
}));

// CORS configuration
const allowedOrigins = config.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    logger.warn('CORS blocked request', { origin, allowedOrigins });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
if (config.NODE_ENV !== 'test') {
  app.use(defaultRateLimiter);
}

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || 
    Math.random().toString(36).substring(2, 15);
  res.setHeader('X-Request-ID', req.headers['x-request-id'] as string);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      requestId: req.headers['x-request-id'],
    });
  });
  
  next();
});

// API Documentation (Swagger)
// if (config.ENABLE_API_DOCS) {
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DevPocket API',
      version: '1.0.0',
      description: 'Mobile-first cloud IDE backend API',
      contact: {
        name: 'DevPocket Team',
        email: 'support@devpocket.app',
      },
    },
    servers: [
      {
        url: config.NODE_ENV === 'production' 
          ? 'https://api.devpocket.app'
          : `http://localhost:${config.PORT}`,
        description: config.NODE_ENV === 'production' ? 'Production' : 'Development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    config.NODE_ENV === 'production' 
      ? ['./dist/routes/*.js', './dist/types/*.js']
      : ['./src/routes/*.ts', './src/types/*.ts']
  ].flat(), // Path to the API files
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Serve the swagger spec as JSON
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'DevPocket API Documentation',
  swaggerOptions: {
    url: '/api-docs.json',
  },
}));
// }

// Health check routes (no rate limiting)
app.use('/health', healthRoutes);

// API routes
const apiV1 = express.Router();

// API Info endpoint
apiV1.get('/info', (_req, res) => {
  res.json({
    name: config.APP_NAME,
    version: '1.0.0',
    environment: config.NODE_ENV,
    features: {
      authentication: true,
      google_oauth: !!config.GOOGLE_CLIENT_ID,
      websockets: true,
      rate_limiting: true,
      metrics: true,
    },
    limits: {
      free_environments: config.FREE_PLAN_MAX_ENVIRONMENTS,
      starter_environments: config.STARTER_PLAN_MAX_ENVIRONMENTS,
      pro_environments: config.PRO_PLAN_MAX_ENVIRONMENTS,
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes
apiV1.use('/auth', authRoutes);
apiV1.use('/users', userRoutes);
apiV1.use('/environments', environmentRoutes);
apiV1.use('/templates', templateRoutes);
apiV1.use('/clusters', clusterRoutes);

// Mount API v1 routes
app.use('/api/v1', apiV1);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    message: 'DevPocket API Server',
    version: '1.0.0',
    environment: config.NODE_ENV,
    documentation: config.ENABLE_API_DOCS ? '/api-docs' : null,
    health: '/health',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await db.disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error during database disconnect', { error });
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await db.disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error('Error during database disconnect', { error });
  }
  
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

export default app;

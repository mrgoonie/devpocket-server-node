/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the user
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         username:
 *           type: string
 *           description: User's username
 *         fullName:
 *           type: string
 *           description: User's full name
 *         emailVerified:
 *           type: boolean
 *           description: Whether the user's email is verified
 *         subscription:
 *           $ref: '#/components/schemas/Subscription'
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Account creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *       required:
 *         - id
 *         - email
 *         - username
 *         - fullName
 *         - emailVerified
 *         - subscription
 *         - createdAt
 *         - updatedAt
 *     
 *     Subscription:
 *       type: object
 *       properties:
 *         plan:
 *           type: string
 *           enum: [FREE, STARTER, PRO, ENTERPRISE]
 *           description: Current subscription plan
 *         status:
 *           type: string
 *           enum: [ACTIVE, CANCELED, PAST_DUE, TRIALING]
 *           description: Subscription status
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Subscription start date
 *         endDate:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Subscription end date (null for active subscriptions)
 *       required:
 *         - plan
 *         - status
 *         - startDate
 *     
 *     Environment:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the environment
 *         userId:
 *           type: string
 *           format: uuid
 *           description: Owner user ID
 *         name:
 *           type: string
 *           description: Environment name
 *         status:
 *           type: string
 *           enum: [CREATING, RUNNING, STOPPED, FAILED, DELETING]
 *           description: Current environment status
 *         templateId:
 *           type: string
 *           format: uuid
 *           description: Template used to create the environment
 *         resources:
 *           $ref: '#/components/schemas/EnvironmentResources'
 *         metadata:
 *           type: object
 *           description: Additional environment metadata
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Environment creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *       required:
 *         - id
 *         - userId
 *         - name
 *         - status
 *         - resources
 *         - createdAt
 *         - updatedAt
 *     
 *     EnvironmentResources:
 *       type: object
 *       properties:
 *         cpu:
 *           type: number
 *           description: CPU cores allocated
 *         memory:
 *           type: number
 *           description: Memory in MB
 *         storage:
 *           type: number
 *           description: Storage in MB
 *       required:
 *         - cpu
 *         - memory
 *         - storage
 *     
 *     Template:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the template
 *         name:
 *           type: string
 *           description: Template name
 *         description:
 *           type: string
 *           description: Template description
 *         category:
 *           type: string
 *           description: Template category
 *         icon:
 *           type: string
 *           description: Template icon URL
 *         baseImage:
 *           type: string
 *           description: Docker base image
 *         defaultResources:
 *           $ref: '#/components/schemas/EnvironmentResources'
 *         setupCommands:
 *           type: array
 *           items:
 *             type: string
 *           description: Commands to run during environment setup
 *         systemPackages:
 *           type: array
 *           items:
 *             type: string
 *           description: System packages to install
 *         isPublic:
 *           type: boolean
 *           description: Whether the template is public
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Template creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *       required:
 *         - id
 *         - name
 *         - description
 *         - category
 *         - baseImage
 *         - defaultResources
 *         - isPublic
 *         - createdAt
 *         - updatedAt
 *     
 *     Cluster:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier for the cluster
 *         name:
 *           type: string
 *           description: Cluster name
 *         region:
 *           type: string
 *           description: Cluster region
 *         status:
 *           type: string
 *           enum: [ACTIVE, MAINTENANCE, DEGRADED, OFFLINE]
 *           description: Cluster status
 *         provider:
 *           type: string
 *           description: Cloud provider
 *         metadata:
 *           type: object
 *           description: Additional cluster metadata
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Cluster creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *       required:
 *         - id
 *         - name
 *         - region
 *         - status
 *         - provider
 *         - createdAt
 *         - updatedAt
 *     
 *     AuthTokens:
 *       type: object
 *       properties:
 *         accessToken:
 *           type: string
 *           description: JWT access token
 *         refreshToken:
 *           type: string
 *           description: JWT refresh token
 *         tokenType:
 *           type: string
 *           default: Bearer
 *           description: Token type
 *         expiresIn:
 *           type: number
 *           description: Access token expiry time in seconds
 *       required:
 *         - accessToken
 *         - refreshToken
 *         - tokenType
 *         - expiresIn
 *     
 *     LoginResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         tokens:
 *           $ref: '#/components/schemas/AuthTokens'
 *       required:
 *         - user
 *         - tokens
 *     
 *     RegisterResponse:
 *       type: object
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         tokens:
 *           $ref: '#/components/schemas/AuthTokens'
 *         message:
 *           type: string
 *           description: Registration success message
 *       required:
 *         - user
 *         - tokens
 *         - message
 *     
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               description: Error code
 *             message:
 *               type: string
 *               description: Error message
 *             statusCode:
 *               type: number
 *               description: HTTP status code
 *             details:
 *               type: object
 *               description: Additional error details
 *           required:
 *             - code
 *             - message
 *             - statusCode
 *       required:
 *         - error
 *     
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           description: Success message
 *         data:
 *           type: object
 *           description: Optional response data
 *       required:
 *         - message
 *     
 *     PaginatedResponse:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             type: object
 *           description: Array of items
 *         pagination:
 *           type: object
 *           properties:
 *             page:
 *               type: number
 *               description: Current page number
 *             limit:
 *               type: number
 *               description: Items per page
 *             total:
 *               type: number
 *               description: Total number of items
 *             totalPages:
 *               type: number
 *               description: Total number of pages
 *           required:
 *             - page
 *             - limit
 *             - total
 *             - totalPages
 *       required:
 *         - data
 *         - pagination
 *     
 *     HealthCheckResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [healthy, unhealthy]
 *           description: Overall health status
 *         version:
 *           type: string
 *           description: API version
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Health check timestamp
 *         services:
 *           type: object
 *           properties:
 *             database:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [connected, disconnected]
 *                 latency:
 *                   type: number
 *                   description: Database latency in ms
 *             redis:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [connected, disconnected]
 *                 latency:
 *                   type: number
 *                   description: Redis latency in ms
 *       required:
 *         - status
 *         - version
 *         - timestamp
 *         - services
 *     
 *     ValidationErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: object
 *           properties:
 *             code:
 *               type: string
 *               default: VALIDATION_ERROR
 *             message:
 *               type: string
 *               description: Validation error message
 *             statusCode:
 *               type: number
 *               default: 400
 *             fields:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: string
 *               description: Field-specific validation errors
 *           required:
 *             - code
 *             - message
 *             - statusCode
 *       required:
 *         - error
 */

// TypeScript interfaces for type safety
export interface User {
  id: string;
  email: string;
  username: string;
  fullName: string;
  emailVerified: boolean;
  subscription: Subscription;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'TRIALING';
  startDate: Date;
  endDate?: Date;
}

export interface Environment {
  id: string;
  userId: string;
  name: string;
  status: 'CREATING' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETING';
  templateId?: string;
  resources: EnvironmentResources;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnvironmentResources {
  cpu: number;
  memory: number;
  storage: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  baseImage: string;
  defaultResources: EnvironmentResources;
  setupCommands?: string[];
  systemPackages?: string[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Cluster {
  id: string;
  name: string;
  region: string;
  status: 'ACTIVE' | 'MAINTENANCE' | 'DEGRADED' | 'OFFLINE';
  provider: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    details?: Record<string, any>;
  };
}

export interface SuccessResponse {
  message: string;
  data?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
    redis: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
  };
}

export interface ValidationErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    statusCode: 400;
    fields?: Record<string, string[]>;
  };
}
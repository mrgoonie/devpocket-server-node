import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { getConfig } from '@/config/env';
import logger from '@/config/logger';

const config = getConfig();

/**
 * Default rate limiter for general API endpoints
 */
export const defaultRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS, // 15 minutes
  max: config.NODE_ENV === 'test' ? 20 : config.RATE_LIMIT_MAX_REQUESTS, // Moderate limit for testing
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: true, // Enable the `X-RateLimit-*` headers for compatibility
  handler: (req: Request, res: Response) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
    });
    
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health check endpoints only
    return req.path.startsWith('/health');
  },
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.ip || 'unknown';
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS, // 15 minutes
  max: config.AUTH_RATE_LIMIT_MAX_REQUESTS, // 5 requests per window
  message: {
    error: 'Too Many Authentication Attempts',
    message: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      body: req.body?.email || req.body?.username_or_email, // Log email/username for tracking
    });
    
    res.status(429).json({
      error: 'Too Many Authentication Attempts',
      message: 'Too many authentication attempts, please try again later.',
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000),
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  },
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return config.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    // Use email/username if provided, otherwise use IP
    const identifier = req.body?.email || req.body?.username_or_email || req.ip;
    return `auth:${identifier}`;
  },
});

/**
 * Moderate rate limiter for WebSocket connections
 */
export const wsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 WebSocket connection attempts per minute
  message: {
    error: 'Too Many WebSocket Connections',
    message: 'Too many WebSocket connection attempts, please try again later.',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('WebSocket rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    
    res.status(429).json({
      error: 'Too Many WebSocket Connections',
      message: 'Too many WebSocket connection attempts, please try again later.',
      retryAfter: 60,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  },
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return config.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    return req.user?.id || req.ip || 'unknown';
  },
});

/**
 * Lenient rate limiter for environment creation
 * (since these are resource-intensive operations)
 */
export const environmentRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 environment creations per hour
  message: {
    error: 'Too Many Environment Creations',
    message: 'Too many environment creation attempts, please try again later.',
    retryAfter: 3600,
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn('Environment creation rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.id,
      userAgent: req.get('User-Agent'),
      path: req.path,
    });
    
    res.status(429).json({
      error: 'Too Many Environment Creations',
      message: 'Too many environment creation attempts, please try again later.',
      retryAfter: 3600,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  },
  keyGenerator: (req: Request) => {
    return `env:${req.user?.id || req.ip}`;
  },
  skip: (req: Request) => {
    // Skip for PRO users (they have higher limits) or test environment
    return req.user?.subscriptionPlan === 'PRO' || req.user?.subscriptionPlan === 'ENTERPRISE' || config.NODE_ENV === 'test';
  },
});

/**
 * Password reset rate limiter
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    error: 'Too Many Password Reset Attempts',
    message: 'Too many password reset attempts, please try again later.',
    retryAfter: 3600,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return config.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    return `password-reset:${req.body?.email || req.ip}`;
  },
});

/**
 * Email verification rate limiter
 */
export const emailVerificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 verification emails per 15 minutes
  message: {
    error: 'Too Many Verification Emails',
    message: 'Too many verification email requests, please try again later.',
    retryAfter: 900,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req: Request) => {
    // Skip rate limiting in test environment
    return config.NODE_ENV === 'test';
  },
  keyGenerator: (req: Request) => {
    return `email-verification:${req.user?.id || req.ip}`;
  },
});

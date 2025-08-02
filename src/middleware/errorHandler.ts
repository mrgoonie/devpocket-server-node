import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '@/config/logger';
import { getConfig } from '@/config/env';
import { ApiError } from '@/types/errors';

const config = getConfig();

interface ErrorResponse {
  error: string;
  message: string;
  errors?: Array<{
    field?: string;
    message: string;
    code?: string;
  }>;
  timestamp: string;
  path: string;
  requestId?: string;
  stack?: string;
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Generate request ID for tracking
  const requestId = req.headers['x-request-id'] as string || 
    Math.random().toString(36).substring(2, 15);

  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: Array<{ field?: string; message: string; code?: string }> | undefined;

  // Handle known API errors
  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    message = error.message;
    errors = error.errors;
    
    // For validation errors, include more specific error context in the main message
    if (error.name === 'ValidationError' && error.errors && error.errors.length > 0) {
      const firstError = error.errors[0];
      if (firstError && firstError.message.toLowerCase().includes('required')) {
        message = 'required fields are missing';
      } else if (firstError && firstError.field === 'email' && firstError.message.toLowerCase().includes('email')) {
        message = 'invalid email format';
      } else if (firstError && firstError.field === 'password') {
        message = 'invalid password format';
      }
    }
  }
  // Handle Zod validation errors
  else if (error instanceof ZodError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
    
    // Provide more specific error messages for common validation cases
    if (errors.length > 0) {
      const firstError = errors[0];
      if (firstError && firstError.message.toLowerCase().includes('required')) {
        message = 'required fields are missing';
      } else if (firstError && firstError.field === 'email' && firstError.message.toLowerCase().includes('email')) {
        message = 'invalid email format';
      } else if (firstError && firstError.field === 'password') {
        message = 'invalid password format';
      }
    }
  }
  // Handle Prisma errors
  else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    ({ statusCode, message, errors } = handlePrismaError(error));
  }
  else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = 500;
    message = 'Database error occurred';
  }
  else if (error instanceof Prisma.PrismaClientRustPanicError) {
    statusCode = 500;
    message = 'Database connection error';
  }
  else if (error instanceof Prisma.PrismaClientInitializationError) {
    statusCode = 503;
    message = 'Database service unavailable';
  }
  else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid database query';
  }
  // Handle JWT errors
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
  }
  // Handle multer errors (file upload)
  else if (error.name === 'MulterError') {
    statusCode = 400;
    message = `File upload error: ${error.message}`;
  }
  // Handle syntax errors (malformed JSON)
  else if (error instanceof SyntaxError && 'body' in error) {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  }
  // Handle payload too large errors
  else if (error.message && error.message.includes('entity too large')) {
    statusCode = 413;
    message = 'Request payload too large';
  }

  // Create error response
  const errorResponse: ErrorResponse = {
    error: error.name === 'ValidationError' || error instanceof ZodError ? message : getErrorName(statusCode),
    message,
    timestamp: new Date().toISOString(),
    path: req.path,
    requestId,
  };

  // Add errors array if present
  if (errors && errors.length > 0) {
    errorResponse.errors = errors;
  }

  // Add stack trace in development
  if ((config.NODE_ENV === 'development' || config.DEBUG) && error.stack) {
    errorResponse.stack = error.stack;
  }

  // Log error
  logger.error('Request error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      params: req.params,
      query: req.query,
    },
    response: {
      statusCode,
      message,
    },
    requestId,
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
  errors?: Array<{ field?: string; message: string; code?: string }>;
} {
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      return {
        statusCode: 409,
        message: 'Resource already exists',
        errors: [{
          field: (error.meta?.target as string[])?.join(', '),
          message: 'This value is already taken',
          code: 'unique_constraint_violation',
        }],
      };

    case 'P2025': // Record not found
      return {
        statusCode: 404,
        message: 'Resource not found',
      };

    case 'P2003': // Foreign key constraint violation
      return {
        statusCode: 400,
        message: 'Invalid reference to related resource',
        errors: [{
          field: error.meta?.field_name as string,
          message: 'Referenced resource does not exist',
          code: 'foreign_key_constraint_violation',
        }],
      };

    case 'P2014': // Required relation violation
      return {
        statusCode: 400,
        message: 'Required relation missing',
        errors: [{
          field: error.meta?.relation_name as string,
          message: 'Required relation is missing',
          code: 'required_relation_violation',
        }],
      };

    case 'P2011': // Null constraint violation
      return {
        statusCode: 400,
        message: 'Required field missing',
        errors: [{
          field: error.meta?.column_name as string,
          message: 'This field is required',
          code: 'null_constraint_violation',
        }],
      };

    case 'P2012': // Missing required value
      return {
        statusCode: 400,
        message: 'Missing required value',
        errors: [{
          field: error.meta?.path as string,
          message: 'Required value is missing',
          code: 'missing_required_value',
        }],
      };

    case 'P2016': // Query interpretation error
      return {
        statusCode: 400,
        message: 'Invalid query parameters',
      };

    case 'P2021': // Table not found
      return {
        statusCode: 500,
        message: 'Database schema error',
      };

    case 'P2022': // Column not found
      return {
        statusCode: 500,
        message: 'Database schema error',
      };

    default:
      return {
        statusCode: 500,
        message: 'Database operation failed',
      };
  }
}

/**
 * Get human-readable error name from status code
 */
function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  return errorNames[statusCode] || 'Unknown Error';
}

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || 
    Math.random().toString(36).substring(2, 15);

  const errorResponse = {
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    path: req.path,
    requestId,
  };

  logger.error('Request error', {
    error: {
      name: 'NotFoundError',
      message: errorResponse.message,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      query: req.query,
    },
    response: {
      statusCode: 404,
      message: errorResponse.message,
    },
    requestId,
  });

  res.status(404).json(errorResponse);
};

/**
 * Async error wrapper
 * Catches async errors and passes them to error handler
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void | Response>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

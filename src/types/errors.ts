export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors:
    | Array<{
        field?: string;
        message: string;
        code?: string;
      }>
    | undefined;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    errors?: Array<{ field?: string; message: string; code?: string }>
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(
    message: string = 'Validation failed',
    errors: Array<{ field?: string; message: string; code?: string }>
  ) {
    super(message, 400, true, errors);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, true);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string = 'Resource already exists') {
    super(message, 409, true);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, true);
    this.name = 'RateLimitError';
    if (retryAfter) {
      (this as any).retryAfter = retryAfter;
    }
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, true);
    this.name = 'ServiceUnavailableError';
  }
}

// Database-specific errors
export class DatabaseError extends ApiError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, true);
    this.name = 'DatabaseError';
  }
}

// Kubernetes-specific errors
export class KubernetesError extends ApiError {
  constructor(message: string = 'Kubernetes operation failed') {
    super(message, 500, true);
    this.name = 'KubernetesError';
  }
}

// WebSocket-specific errors
export class WebSocketError extends ApiError {
  constructor(message: string = 'WebSocket operation failed') {
    super(message, 500, true);
    this.name = 'WebSocketError';
  }
}

// Email service errors
export class EmailError extends ApiError {
  constructor(message: string = 'Email service error') {
    super(message, 500, true);
    this.name = 'EmailError';
  }
}

// Environment-specific errors
export class EnvironmentError extends ApiError {
  constructor(message: string = 'Environment operation failed') {
    super(message, 500, true);
    this.name = 'EnvironmentError';
  }
}

export class EnvironmentNotReadyError extends ApiError {
  constructor(message: string = 'Environment is not ready') {
    super(message, 409, true);
    this.name = 'EnvironmentNotReadyError';
  }
}

export class ResourceLimitError extends ApiError {
  constructor(message: string = 'Resource limit exceeded') {
    super(message, 403, true);
    this.name = 'ResourceLimitError';
  }
}

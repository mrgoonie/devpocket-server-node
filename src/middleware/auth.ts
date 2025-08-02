import { Request, Response, NextFunction } from 'express';
import { prisma } from '@/config/database';
import jwtService, { JwtPayload } from '@/utils/jwt';
import logger from '@/config/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        username: string;
        fullName: string;
        subscriptionPlan: string;
        isVerified: boolean;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    subscriptionPlan: string;
    isVerified: boolean;
  };
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Access token is required',
      });
      return;
    }

    // Verify token
    let payload: JwtPayload;
    try {
      payload = jwtService.verifyToken(token);
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: error instanceof Error ? error.message : 'Invalid token',
      });
      return;
    }

    // Check if it's an access token
    if (payload.type !== 'access') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token type',
      });
      return;
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        subscriptionPlan: true,
        isActive: true,
        isVerified: true,
        accountLockedUntil: true,
      },
    });

    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Account is deactivated',
      });
      return;
    }

    // Check if account is locked
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Account is temporarily locked',
      });
      return;
    }

    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      subscriptionPlan: user.subscriptionPlan,
      isVerified: user.isVerified,
    };

    next();
  } catch (error) {
    logger.error('Authentication middleware error', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't return 401 if no token
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      // No token provided, continue without user
      next();
      return;
    }

    // Try to authenticate, but don't fail if it doesn't work
    try {
      const payload = jwtService.verifyToken(token);
      
      if (payload.type === 'access') {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: {
            id: true,
            email: true,
            username: true,
            fullName: true,
            subscriptionPlan: true,
            isActive: true,
            isVerified: true,
            accountLockedUntil: true,
          },
        });

        if (user && user.isActive && (!user.accountLockedUntil || user.accountLockedUntil <= new Date())) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            fullName: user.fullName,
            subscriptionPlan: user.subscriptionPlan,
            isVerified: user.isVerified,
          };
        }
      }
    } catch (error) {
      // Token is invalid, but we don't fail - just continue without user
      logger.debug('Optional authentication failed', { error });
    }

    next();
  } catch (error) {
    logger.error('Optional authentication middleware error', { error });
    next(); // Continue even if there's an error
  }
};

/**
 * Email verification middleware
 * Requires user to have verified their email
 */
export const requireEmailVerification = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  if (!req.user.isVerified) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Email verification required',
    });
    return;
  }

  next();
};

/**
 * Admin role middleware
 * Requires user to have admin privileges (pro plan for now)
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // For now, treat PRO and ENTERPRISE users as admins
  const adminPlans = ['PRO', 'ENTERPRISE'];
  if (!adminPlans.includes(req.user.subscriptionPlan)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin privileges required',
    });
    return;
  }

  next();
};

/**
 * Subscription plan middleware factory
 * Requires user to have specific subscription plan or higher
 */
export const requireSubscription = (requiredPlan: string) => {
  const planHierarchy = ['FREE', 'STARTER', 'PRO', 'ENTERPRISE'];
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const userPlanIndex = planHierarchy.indexOf(req.user.subscriptionPlan);
    const requiredPlanIndex = planHierarchy.indexOf(requiredPlan);

    if (userPlanIndex === -1 || requiredPlanIndex === -1) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Invalid subscription plan configuration',
      });
      return;
    }

    if (userPlanIndex < requiredPlanIndex) {
      res.status(403).json({
        error: 'Forbidden',
        message: `${requiredPlan} subscription or higher required`,
      });
      return;
    }

    next();
  };
};

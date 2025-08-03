import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, AuthenticatedRequest, requireEmailVerification } from '@/middleware/auth';
import { ValidationError, NotFoundError, ConflictError } from '@/types/errors';
import passwordService from '@/utils/password';
import logger from '@/config/logger';

const router: Router = Router();

// Validation schemas
const updateUserSchema = z.object({
  fullName: z.string()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be less than 100 characters')
    .optional(),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens')
    .optional(),
  avatarUrl: z.string().url('Invalid avatar URL').optional().nullable(),
  // Note: email updates are not allowed through this endpoint for security
  // Use a separate email change endpoint that requires verification
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters'),
});

const deleteUserSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   allOf:
 *                     - $ref: '#/components/schemas/User'
 *                     - type: object
 *                       properties:
 *                         environmentCount:
 *                           type: number
 *                           description: Number of active environments
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const user = await prisma.user.findUnique({
    where: { id: authReq.user.id },
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      isActive: true,
      isVerified: true,
      avatarUrl: true,
      subscriptionPlan: true,
      createdAt: true,
      lastLoginAt: true,
      // Include related data
      _count: {
        select: {
          environments: {
            where: {
              status: {
                notIn: ['TERMINATED'],
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    user: {
      ...user,
      environmentCount: user._count.environments,
      _count: undefined, // Remove the count object from response
    },
  });
}));

/**
 * @swagger
 * /api/v1/users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Updated Doe
 *               username:
 *                 type: string
 *                 example: newusername
 *               avatarUrl:
 *                 type: string
 *                 format: url
 *                 example: https://example.com/avatar.jpg
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Username already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/me', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const validationResult = updateUserSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const updateData = validationResult.data;

  // If username is being updated, check if it's already taken
  if (updateData.username) {
    const existingUser = await prisma.user.findFirst({
      where: {
        username: updateData.username.toLowerCase(),
        id: { not: authReq.user.id },
      },
    });

    if (existingUser) {
      throw new ConflictError('Username already exists');
    }
  }

  // Update user (excluding email changes - they need a separate secure flow)
  const userData: any = {};
  if (updateData.username) userData.username = updateData.username.toLowerCase();
  if (updateData.fullName) userData.fullName = updateData.fullName;
  if (updateData.avatarUrl !== undefined) userData.avatarUrl = updateData.avatarUrl;

  const updatedUser = await prisma.user.update({
    where: { id: authReq.user.id },
    data: userData,
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      isActive: true,
      isVerified: true,
      avatarUrl: true,
      subscriptionPlan: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  logger.info('User profile updated', {
    userId: authReq.user.id,
    updatedFields: Object.keys(updateData),
  });

  res.json({
    user: {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      emailVerified: updatedUser.isVerified,
      subscription: {
        plan: updatedUser.subscriptionPlan,
        status: 'ACTIVE',
        startDate: updatedUser.createdAt,
      },
      createdAt: updatedUser.createdAt,
      updatedAt: new Date(),
    },
  });
}));

/**
 * @swagger
 * /api/v1/users/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: currentPassword123
 *               newPassword:
 *                 type: string
 *                 example: newSecurePassword123
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error or incorrect current password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/change-password', 
  authenticate, 
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const validationResult = changePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })));
    }

    const { currentPassword, newPassword } = validationResult.data;

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user || !user.password) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await passwordService.verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new ValidationError('Current password is incorrect', [{
        field: 'currentPassword',
        message: 'Current password is incorrect',
        code: 'invalid_password',
      }]);
    }

    // Validate new password strength
    const passwordValidation = passwordService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationError('New password validation failed', passwordValidation.errors.map(error => ({
        field: 'newPassword',
        message: error,
        code: 'weak_password',
      })));
    }

    // Hash new password
    const hashedNewPassword = await passwordService.hashPassword(newPassword);

    // Update password and revoke all refresh tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: authReq.user.id },
        data: {
          password: hashedNewPassword,
          failedLoginAttempts: 0, // Reset failed attempts
          accountLockedUntil: null, // Unlock account if locked
        },
      }),
      prisma.refreshToken.updateMany({
        where: {
          userId: authReq.user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    logger.info('User password changed', { userId: authReq.user.id });

    res.json({
      message: 'Password changed successfully. Please log in again.',
    });
  })
);

/**
 * @swagger
 * /api/v1/users/me/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/me/stats', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const stats = await prisma.user.findUnique({
    where: { id: authReq.user.id },
    select: {
      _count: {
        select: {
          environments: {
            where: {
              status: { notIn: ['TERMINATED'] },
            },
          },
          refreshTokens: {
            where: {
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          },
        },
      },
      environments: {
        select: {
          status: true,
          createdAt: true,
          lastActivityAt: true,
        },
        where: {
          status: { notIn: ['TERMINATED'] },
        },
      },
    },
  });

  if (!stats) {
    throw new NotFoundError('User not found');
  }

  // Calculate environment stats
  const environmentsByStatus = stats.environments.reduce((acc, env) => {
    acc[env.status] = (acc[env.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate activity stats
  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentActivity = {
    environmentsCreatedLast7Days: stats.environments.filter(env => 
      env.createdAt > last7Days
    ).length,
    environmentsCreatedLast30Days: stats.environments.filter(env => 
      env.createdAt > last30Days
    ).length,
    environmentsActiveLastWeek: stats.environments.filter(env => 
      env.lastActivityAt && env.lastActivityAt > last7Days
    ).length,
  };

  res.json({
    totalEnvironments: stats._count.environments,
    activeTokens: stats._count.refreshTokens,
    environmentsByStatus,
    recentActivity,
  });
}));

/**
 * @swagger
 * /api/v1/users/me:
 *   delete:
 *     summary: Delete current user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User account deleted successfully
 *       401:
 *         description: Unauthorized
 */
router.delete('/me', 
  authenticate, 
  requireEmailVerification,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    
    // Validate request body
    const validationResult = deleteUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })));
    }

    const { password } = validationResult.data;

    // Get user with password for verification
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user || !user.password) {
      throw new NotFoundError('User not found');
    }

    // Verify password
    const isPasswordValid = await passwordService.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new ValidationError('Incorrect password', [{
        field: 'password',
        message: 'Incorrect password',
        code: 'invalid_password',
      }]);
    }

    // Soft delete: deactivate user and anonymize data
    await prisma.$transaction(async (tx) => {
      // First, terminate all user environments
      await tx.environment.updateMany({
        where: { userId: authReq.user.id },
        data: { status: 'TERMINATED' },
      });

      // Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId: authReq.user.id },
        data: { revokedAt: new Date() },
      });

      // Anonymize and deactivate user
      await tx.user.update({
        where: { id: authReq.user.id },
        data: {
          isActive: false,
          email: `deleted_${authReq.user.id}@devpocket.deleted`,
          username: `deleted_${authReq.user.id}`,
          fullName: 'Deleted User',
          password: null,
          avatarUrl: null,
          googleId: null,
        },
      });
    });

    logger.info('User account deleted', {
      userId: authReq.user.id,
      email: authReq.user.email,
    });

    res.json({
      message: 'User account deleted successfully',
    });
  })
);

export default router;

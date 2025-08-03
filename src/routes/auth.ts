import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, AuthenticatedRequest } from '@/middleware/auth';
import { authRateLimiter, emailVerificationRateLimiter } from '@/middleware/rateLimiter';
import jwtService from '@/utils/jwt';
import passwordService from '@/utils/password';
import { ValidationError, AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from '@/types/errors';
import logger from '@/config/logger';
import { getConfig } from '@/config/env';
import emailService from '@/services/email';

const router: Router = Router();
const config = getConfig();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters'),
  fullName: z.string()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be less than 100 characters'),
});

const loginSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});


const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: securePassword123
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RegisterResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       409:
 *         description: User already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/register', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const validationResult = registerSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const { email, username, password, fullName } = validationResult.data;

  // Validate password strength
  const passwordValidation = passwordService.validatePasswordStrength(password);
  if (!passwordValidation.isValid) {
    throw new ValidationError('Password validation failed', passwordValidation.errors.map(error => ({
      field: 'password',
      message: error,
      code: 'weak_password',
    })));
  }

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    },
  });

  if (existingUser) {
    const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
    throw new ConflictError(`User with this ${field} already exists`);
  }

  // Hash password
  const hashedPassword = await passwordService.hashPassword(password);

  // Create user and email verification token in a transaction
  const { user, verificationToken } = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: email.toLowerCase(),
        username: username.toLowerCase(),
        fullName,
        password: hashedPassword,
      },
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

    // Create email verification token
    const token = await tx.emailVerificationToken.create({
      data: {
        userId: newUser.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    return { user: newUser, verificationToken: token };
  });

  // Send verification email
  const verificationUrl = `${config.FRONTEND_URL}/verify-email?token=${verificationToken.token}`;
  try {
    await emailService.sendEmailVerification({
      to: user.email,
      username: user.username,
      verificationUrl,
    });
    logger.info('Verification email sent', { userId: user.id, email: user.email });
  } catch (error) {
    logger.error('Failed to send verification email', { userId: user.id, email: user.email, error });
    // Don't fail registration if email sending fails
  }

  logger.info('User registered', { userId: user.id, email: user.email, username: user.username });

  // Generate tokens for immediate login
  const tokenPair = jwtService.generateTokenPair({
    userId: user.id,
    username: user.username,
    email: user.email,
  });

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: tokenPair.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      emailVerified: user.isVerified,
      subscription: {
        plan: user.subscriptionPlan,
        status: 'ACTIVE',
        startDate: user.createdAt,
      },
      createdAt: user.createdAt,
      updatedAt: user.createdAt,
    },
    tokens: {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenPair.expiresIn,
    },
    message: 'Registration successful. Please check your email to verify your account.',
  });
}));

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User login with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - usernameOrEmail
 *               - password
 *             properties:
 *               usernameOrEmail:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: securePassword123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Account locked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/login', authRateLimiter, asyncHandler(async (req: Request, res: Response) => {
  const validationResult = loginSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const { usernameOrEmail, password } = validationResult.data;

  // Find user by email or username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: usernameOrEmail.toLowerCase() },
        { username: usernameOrEmail.toLowerCase() },
      ],
    },
  });

  if (!user || !user.password) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Check if account is locked
  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    const lockTimeRemaining = Math.ceil((user.accountLockedUntil.getTime() - Date.now()) / 60000);
    throw new AuthenticationError(`Account is locked. Try again in ${lockTimeRemaining} minutes.`);
  }

  // Verify password
  const isPasswordValid = await passwordService.verifyPassword(password, user.password);
  
  if (!isPasswordValid) {
    // Increment failed login attempts
    const failedAttempts = user.failedLoginAttempts + 1;
    const shouldLockAccount = failedAttempts >= config.ACCOUNT_LOCKOUT_ATTEMPTS;
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: failedAttempts,
        accountLockedUntil: shouldLockAccount 
          ? new Date(Date.now() + config.ACCOUNT_LOCKOUT_DURATION)
          : null,
      },
    });

    if (shouldLockAccount) {
      logger.warn('Account locked due to failed login attempts', { 
        userId: user.id, 
        email: user.email,
        attempts: failedAttempts,
      });
      throw new AuthenticationError('Account has been locked due to multiple failed login attempts');
    }

    throw new AuthenticationError('Invalid credentials');
  }

  // Check if user is active
  if (!user.isActive) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Check if user is verified
  if (!user.isVerified) {
    throw new AuthorizationError('Account is not verified. Please check your email for verification instructions.');
  }

  // Reset failed login attempts on successful login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  // Generate tokens
  const tokenPair = jwtService.generateTokenPair({
    userId: user.id,
    username: user.username,
    email: user.email,
  });

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: tokenPair.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  logger.info('User logged in', { userId: user.id, email: user.email });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      emailVerified: user.isVerified,
      subscription: {
        plan: user.subscriptionPlan,
        status: 'ACTIVE',
        startDate: user.createdAt,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    tokens: {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenPair.expiresIn,
    },
  });
}));

/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh JWT access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthTokens'
 *       401:
 *         description: Invalid refresh token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const validationResult = refreshTokenSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const { refreshToken } = validationResult.data;

  // Verify refresh token
  let payload;
  try {
    payload = jwtService.verifyToken(refreshToken);
  } catch (error) {
    throw new AuthenticationError('Invalid refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new AuthenticationError('Invalid token type');
  }

  // Check if refresh token exists in database
  const storedToken = await prisma.refreshToken.findFirst({
    where: {
      token: refreshToken,
      userId: payload.userId,
      expiresAt: { gt: new Date() },
      revokedAt: null,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          isActive: true,
        },
      },
    },
  });

  if (!storedToken) {
    throw new AuthenticationError('Refresh token not found or expired');
  }

  if (!storedToken.user.isActive) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Generate new token pair
  const newTokenPair = jwtService.generateTokenPair({
    userId: storedToken.user.id,
    username: storedToken.user.username,
    email: storedToken.user.email,
  });

  // Revoke old refresh token and create new one
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        token: newTokenPair.refreshToken,
        userId: storedToken.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    }),
  ]);

  res.json({
    accessToken: newTokenPair.accessToken,
    refreshToken: newTokenPair.refreshToken,
    tokenType: 'Bearer',
    expiresIn: newTokenPair.expiresIn,
  });
}));

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get current user information
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
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
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    emailVerified: user.isVerified,
    subscription: {
      plan: user.subscriptionPlan,
      status: 'ACTIVE',
      startDate: user.createdAt,
    },
    createdAt: user.createdAt,
    updatedAt: user.lastLoginAt || user.createdAt,
  });
}));

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout user (invalidate tokens)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/logout', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  // Revoke all refresh tokens for the user
  await prisma.refreshToken.updateMany({
    where: {
      userId: authReq.user.id,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  logger.info('User logged out', { userId: authReq.user.id, email: authReq.user.email });

  res.json({
    message: 'Successfully logged out',
  });
}));

/**
 * @swagger
 * /api/v1/auth/verify-email:
 *   post:
 *     summary: Verify user email address
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: email_verification_token
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const validationResult = emailVerificationSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const { token } = validationResult.data;

  // Find verification token
  const verificationToken = await prisma.emailVerificationToken.findFirst({
    where: {
      token,
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
    include: {
      user: true,
    },
  });

  if (!verificationToken) {
    throw new NotFoundError('Invalid or expired verification token');
  }

  // Update user and mark token as used
  await prisma.$transaction([
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: {
        isVerified: true,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  logger.info('Email verified', { 
    userId: verificationToken.userId, 
    email: verificationToken.user.email 
  });

  res.json({
    message: 'Email verified successfully',
  });
}));

/**
 * @swagger
 * /api/v1/auth/resend-verification:
 *   post:
 *     summary: Resend email verification
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Verification email sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Email already verified or too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/resend-verification', 
  emailVerificationRateLimiter,
  authenticate, 
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const user = await prisma.user.findUnique({
      where: { id: authReq.user.id },
      select: {
        id: true,
        email: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.isVerified) {
      throw new ValidationError('Email is already verified', []);
    }

    // Create new verification token
    await prisma.emailVerificationToken.create({
      data: {
        token: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // TODO: Send verification email
    // await emailService.sendVerificationEmail(user.email, verificationToken.token);

    logger.info('Verification email resent', { userId: user.id, email: user.email });

    res.json({
      message: 'Verification email sent',
    });
  })
);

// TODO: Implement Google OAuth route
// router.post('/google', ...)

export default router;

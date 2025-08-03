import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, AuthenticatedRequest, requireEmailVerification } from '@/middleware/auth';
import { environmentRateLimiter } from '@/middleware/rateLimiter';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ResourceLimitError,
  KubernetesError,
} from '@/types/errors';
import logger from '@/config/logger';
import { getConfig } from '@/config/env';
import kubernetesService from '@/services/kubernetes';

const router: Router = Router();
const config = getConfig();

// Validation schemas
const createEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, 'Environment name is required')
    .max(50, 'Environment name must be less than 50 characters')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Environment name can only contain letters, numbers, hyphens, and underscores'
    ),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  templateId: z.string().min(1, 'Template ID is required'),
  clusterId: z.string().min(1, 'Cluster ID is required').optional(),
  resources: z
    .object({
      cpu: z
        .string()
        .regex(/^\d+m?$/, 'Invalid CPU format')
        .optional(),
      memory: z
        .string()
        .regex(/^\d+[GMK]i?$/, 'Invalid memory format')
        .optional(),
      storage: z
        .string()
        .regex(/^\d+[GMK]i?$/, 'Invalid storage format')
        .optional(),
    })
    .optional(),
  environmentVariables: z.record(z.string()).optional(),
});

const updateEnvironmentSchema = z.object({
  name: z
    .string()
    .min(1, 'Environment name is required')
    .max(50, 'Environment name must be less than 50 characters')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Environment name can only contain letters, numbers, hyphens, and underscores'
    )
    .optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  resources: z
    .object({
      cpu: z
        .string()
        .regex(/^\d+m?$/, 'Invalid CPU format')
        .optional(),
      memory: z
        .string()
        .regex(/^\d+[GMK]i?$/, 'Invalid memory format')
        .optional(),
      storage: z
        .string()
        .regex(/^\d+[GMK]i?$/, 'Invalid storage format')
        .optional(),
    })
    .optional(),
  environmentVariables: z.record(z.string()).optional(),
});

// Helper function to check user environment limits
async function checkEnvironmentLimits(userId: string, subscriptionPlan: string): Promise<void> {
  const currentCount = await prisma.environment.count({
    where: {
      userId,
      status: { notIn: ['TERMINATED'] },
    },
  });

  let maxEnvironments: number;
  switch (subscriptionPlan) {
    case 'FREE':
      maxEnvironments = config.FREE_PLAN_MAX_ENVIRONMENTS;
      break;
    case 'STARTER':
      maxEnvironments = config.STARTER_PLAN_MAX_ENVIRONMENTS;
      break;
    case 'PRO':
    case 'ENTERPRISE':
      maxEnvironments = config.PRO_PLAN_MAX_ENVIRONMENTS;
      break;
    default:
      maxEnvironments = config.FREE_PLAN_MAX_ENVIRONMENTS;
  }

  if (currentCount >= maxEnvironments) {
    throw new ResourceLimitError(
      `Environment limit reached. Your ${subscriptionPlan} plan allows ${maxEnvironments} environments.`
    );
  }
}

/**
 * @swagger
 * /api/v1/environments:
 *   post:
 *     summary: Create a new development environment
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - templateId
 *             properties:
 *               name:
 *                 type: string
 *                 example: my-python-env
 *               description:
 *                 type: string
 *                 example: Python development environment
 *               templateId:
 *                 type: string
 *                 example: python-3.11
 *               clusterId:
 *                 type: string
 *                 example: default-cluster
 *               resources:
 *                 type: object
 *                 properties:
 *                   cpu:
 *                     type: string
 *                     example: 500m
 *                   memory:
 *                     type: string
 *                     example: 1Gi
 *                   storage:
 *                     type: string
 *                     example: 10Gi
 *               environmentVariables:
 *                 type: object
 *                 example:
 *                   DEBUG: "true"
 *                   DATABASE_URL: "postgresql://..."
 *     responses:
 *       201:
 *         description: Environment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Environment'
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
 *       403:
 *         description: Email not verified
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Resource limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  environmentRateLimiter,
  authenticate,
  requireEmailVerification,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const validationResult = createEnvironmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError(
        'Validation failed',
        validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }))
      );
    }

    const { name, description, templateId, clusterId, resources, environmentVariables } =
      validationResult.data;

    // Check environment limits
    await checkEnvironmentLimits(authReq.user.id, authReq.user.subscriptionPlan);

    // Check if environment name already exists for user
    const existingEnvironment = await prisma.environment.findFirst({
      where: {
        userId: authReq.user.id,
        name,
        status: { notIn: ['TERMINATED'] },
      },
    });

    if (existingEnvironment) {
      throw new ConflictError('Environment with this name already exists');
    }

    // Verify template exists
    const template = await prisma.template.findFirst({
      where: {
        id: templateId,
        status: { in: ['ACTIVE', 'BETA'] },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found or inactive');
    }

    // Use default cluster if not specified
    const finalClusterId = clusterId || config.CLUSTER_NAME;

    // Merge template defaults with user-provided resources
    const finalResources = {
      cpu: resources?.cpu || template.defaultResourcesCpu,
      memory: resources?.memory || template.defaultResourcesMemory,
      storage: resources?.storage || template.defaultResourcesStorage,
    };

    // Create environment
    const environment = await prisma.environment.create({
      data: {
        name,
        description: description || null,
        userId: authReq.user.id,
        templateId: template.id,
        clusterId: finalClusterId,
        dockerImage: template.dockerImage,
        port: template.defaultPort,
        resourcesCpu: finalResources.cpu,
        resourcesMemory: finalResources.memory,
        resourcesStorage: finalResources.storage,
        environmentVariables: {
          ...((template.environmentVariables as Record<string, any>) || {}),
          ...(environmentVariables || {}),
        },
        status: 'CREATING',
      },
      include: {
        template: {
          select: {
            name: true,
            displayName: true,
          },
        },
        cluster: {
          select: {
            name: true,
          },
        },
      },
    });

    // Start environment creation process in Kubernetes
    try {
      await kubernetesService.createEnvironment({
        environmentId: environment.id,
        userId: authReq.user.id,
        name: environment.name,
        dockerImage: environment.dockerImage,
        port: environment.port,
        resources: finalResources,
        environmentVariables: environment.environmentVariables as Record<string, string>,
        startupCommands: template.startupCommands,
      });

      logger.info('Environment Kubernetes resources created successfully', {
        environmentId: environment.id,
        userId: authReq.user.id,
      });
    } catch (error) {
      const errorDetails = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      };

      logger.error('Failed to create environment in Kubernetes', {
        environmentId: environment.id,
        userId: authReq.user.id,
        error: errorDetails,
      });

      // Delete the database record since K8s creation failed
      try {
        await prisma.environment.delete({
          where: { id: environment.id },
        });
        logger.info('Cleaned up failed environment from database', {
          environmentId: environment.id,
        });
      } catch (cleanupError) {
        logger.error('Failed to cleanup failed environment', {
          environmentId: environment.id,
          error: {
            name: cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
            message: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
          },
        });
      }

      // Return proper error response instead of 201 success
      throw new KubernetesError(`Failed to create Kubernetes resources: ${errorDetails.message}`);
    }

    logger.info('Environment created', {
      environmentId: environment.id,
      userId: authReq.user.id,
      name: environment.name,
      templateId: template.id,
    });

    res.status(201).json({
      id: environment.id,
      name: environment.name,
      description: environment.description,
      templateId: environment.templateId,
      templateName: environment.template.displayName,
      clusterId: environment.clusterId,
      clusterName: environment.cluster.name,
      status: environment.status,
      dockerImage: environment.dockerImage,
      port: environment.port,
      webPort: environment.webPort,
      resources: {
        cpu: environment.resourcesCpu,
        memory: environment.resourcesMemory,
        storage: environment.resourcesStorage,
      },
      environmentVariables: environment.environmentVariables,
      installationCompleted: environment.installationCompleted,
      externalUrl: environment.externalUrl,
      createdAt: environment.createdAt,
      updatedAt: environment.updatedAt,
      lastActivityAt: environment.lastActivityAt,
      cpuUsage: environment.cpuUsage,
      memoryUsage: environment.memoryUsage,
      storageUsage: environment.storageUsage,
    });
  })
);

/**
 * @swagger
 * /api/v1/environments:
 *   get:
 *     summary: List user's environments
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATING, PROVISIONING, INSTALLING, CONFIGURING, RUNNING, STOPPED, STOPPING, RESTARTING, ERROR, TERMINATED]
 *         description: Filter by environment status
 *       - in: query
 *         name: templateId
 *         schema:
 *           type: string
 *         description: Filter by template ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of environments to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of environments to skip
 *     responses:
 *       200:
 *         description: Environments retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { status, templateId } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const where: any = {
      userId: authReq.user.id,
      status: { notIn: ['TERMINATED'] }, // Don't show terminated environments by default
    };

    if (status && typeof status === 'string') {
      where.status = status;
    }

    if (templateId && typeof templateId === 'string') {
      where.templateId = templateId;
    }

    const [environments, total] = await Promise.all([
      prisma.environment.findMany({
        where,
        include: {
          template: {
            select: {
              name: true,
              displayName: true,
            },
          },
          cluster: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.environment.count({ where }),
    ]);

    const formattedEnvironments = environments.map(env => ({
      id: env.id,
      name: env.name,
      description: env.description,
      templateId: env.templateId,
      templateName: env.template.displayName,
      clusterId: env.clusterId,
      clusterName: env.cluster.name,
      status: env.status,
      dockerImage: env.dockerImage,
      port: env.port,
      webPort: env.webPort,
      resources: {
        cpu: env.resourcesCpu,
        memory: env.resourcesMemory,
        storage: env.resourcesStorage,
      },
      environmentVariables: env.environmentVariables,
      installationCompleted: env.installationCompleted,
      externalUrl: env.externalUrl,
      createdAt: env.createdAt,
      updatedAt: env.updatedAt,
      lastActivityAt: env.lastActivityAt,
      cpuUsage: env.cpuUsage,
      memoryUsage: env.memoryUsage,
      storageUsage: env.storageUsage,
    }));

    res.json({
      environments: formattedEnvironments,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}:
 *   get:
 *     summary: Get specific environment details
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.get(
  '/:environmentId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
      include: {
        template: {
          select: {
            name: true,
            displayName: true,
            description: true,
            category: true,
            tags: true,
          },
        },
        cluster: {
          select: {
            name: true,
            region: true,
          },
        },
        terminalSessions: {
          select: {
            id: true,
            sessionId: true,
            status: true,
            startedAt: true,
            lastActivityAt: true,
          },
          where: {
            status: 'ACTIVE',
          },
        },
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    res.json({
      id: environment.id,
      name: environment.name,
      description: environment.description,
      templateId: environment.templateId,
      template: environment.template,
      clusterId: environment.clusterId,
      cluster: environment.cluster,
      status: environment.status,
      dockerImage: environment.dockerImage,
      port: environment.port,
      webPort: environment.webPort,
      resources: {
        cpu: environment.resourcesCpu,
        memory: environment.resourcesMemory,
        storage: environment.resourcesStorage,
      },
      environmentVariables: environment.environmentVariables,
      installationCompleted: environment.installationCompleted,
      externalUrl: environment.externalUrl,
      kubernetesNamespace: environment.kubernetesNamespace,
      kubernetesPodName: environment.kubernetesPodName,
      kubernetesServiceName: environment.kubernetesServiceName,
      createdAt: environment.createdAt,
      updatedAt: environment.updatedAt,
      lastActivityAt: environment.lastActivityAt,
      cpuUsage: environment.cpuUsage,
      memoryUsage: environment.memoryUsage,
      storageUsage: environment.storageUsage,
      terminalSessions: environment.terminalSessions,
    });
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}:
 *   put:
 *     summary: Update environment configuration
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: updated-env-name
 *               description:
 *                 type: string
 *                 example: Updated environment description
 *               resources:
 *                 type: object
 *                 properties:
 *                   cpu:
 *                     type: string
 *                     example: 1000m
 *                   memory:
 *                     type: string
 *                     example: 2Gi
 *                   storage:
 *                     type: string
 *                     example: 20Gi
 *               environmentVariables:
 *                 type: object
 *                 example:
 *                   DEBUG: "false"
 *                   NODE_ENV: "production"
 *     responses:
 *       200:
 *         description: Environment updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.put(
  '/:environmentId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    const validationResult = updateEnvironmentSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError(
        'Validation failed',
        validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }))
      );
    }

    const updateData = validationResult.data;

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    // Check if new name conflicts with existing environment
    if (updateData.name && updateData.name !== environment.name) {
      const existingEnvironment = await prisma.environment.findFirst({
        where: {
          userId: authReq.user.id,
          name: updateData.name,
          status: { notIn: ['TERMINATED'] },
          id: { not: environmentId },
        },
      });

      if (existingEnvironment) {
        throw new ConflictError('Environment with this name already exists');
      }
    }

    // Prepare update data
    const dbUpdateData: any = {};
    if (updateData.name) dbUpdateData.name = updateData.name;
    if (updateData.description !== undefined) dbUpdateData.description = updateData.description;
    if (updateData.resources) {
      if (updateData.resources.cpu) dbUpdateData.resourcesCpu = updateData.resources.cpu;
      if (updateData.resources.memory) dbUpdateData.resourcesMemory = updateData.resources.memory;
      if (updateData.resources.storage)
        dbUpdateData.resourcesStorage = updateData.resources.storage;
    }
    if (updateData.environmentVariables) {
      dbUpdateData.environmentVariables = {
        ...((environment.environmentVariables as Record<string, any>) || {}),
        ...updateData.environmentVariables,
      };
    }

    // Update environment in database
    const updatedEnvironment = await prisma.environment.update({
      where: { id: environmentId },
      data: dbUpdateData,
      include: {
        template: {
          select: {
            name: true,
            displayName: true,
          },
        },
        cluster: {
          select: {
            name: true,
          },
        },
      },
    });

    logger.info('Environment updated', {
      environmentId,
      userId: authReq.user.id,
      updatedFields: Object.keys(dbUpdateData),
    });

    res.json({
      id: updatedEnvironment.id,
      name: updatedEnvironment.name,
      description: updatedEnvironment.description,
      templateId: updatedEnvironment.templateId,
      templateName: updatedEnvironment.template.displayName,
      clusterId: updatedEnvironment.clusterId,
      clusterName: updatedEnvironment.cluster.name,
      status: updatedEnvironment.status,
      dockerImage: updatedEnvironment.dockerImage,
      port: updatedEnvironment.port,
      webPort: updatedEnvironment.webPort,
      resources: {
        cpu: updatedEnvironment.resourcesCpu,
        memory: updatedEnvironment.resourcesMemory,
        storage: updatedEnvironment.resourcesStorage,
      },
      environmentVariables: updatedEnvironment.environmentVariables,
      installationCompleted: updatedEnvironment.installationCompleted,
      externalUrl: updatedEnvironment.externalUrl,
      createdAt: updatedEnvironment.createdAt,
      updatedAt: updatedEnvironment.updatedAt,
      lastActivityAt: updatedEnvironment.lastActivityAt,
      cpuUsage: updatedEnvironment.cpuUsage,
      memoryUsage: updatedEnvironment.memoryUsage,
      storageUsage: updatedEnvironment.storageUsage,
    });
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}:
 *   delete:
 *     summary: Delete environment
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.delete(
  '/:environmentId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    // Prevent deletion of running environments
    if (environment.status === 'RUNNING') {
      throw new ValidationError(
        'Cannot delete running environment. Please stop the environment first.',
        []
      );
    }

    // Delete from Kubernetes first
    try {
      await kubernetesService.deleteEnvironment(environmentId);
    } catch (error) {
      logger.error('Failed to delete environment from Kubernetes', { environmentId, error });
      // Continue with database cleanup even if Kubernetes deletion fails
    }

    // Clean up terminal sessions
    await prisma.terminalSession.updateMany({
      where: { environmentId },
      data: { status: 'TERMINATED' },
    });

    // Update environment status to TERMINATED
    await prisma.environment.update({
      where: { id: environmentId },
      data: { status: 'TERMINATED' },
    });

    logger.info('Environment deleted', {
      environmentId,
      userId: authReq.user.id,
    });

    res.json({
      message: 'Environment deleted successfully',
    });
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}/start:
 *   post:
 *     summary: Start environment
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment start initiated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.post(
  '/:environmentId/start',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    if (environment.status === 'RUNNING') {
      return res.json({
        message: 'Environment is already running',
        status: environment.status,
      });
    }

    // Start environment in Kubernetes
    try {
      await kubernetesService.startEnvironment(environmentId);

      res.json({
        message: 'Environment start initiated',
        status: 'STARTING',
      });
      return;
    } catch (error) {
      logger.error('Failed to start environment', { environmentId, error });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}/stop:
 *   post:
 *     summary: Stop environment
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment stop initiated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.post(
  '/:environmentId/stop',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    if (environment.status === 'STOPPED') {
      return res.json({
        message: 'Environment is already stopped',
        status: environment.status,
      });
    }

    // Stop environment in Kubernetes
    try {
      await kubernetesService.stopEnvironment(environmentId);

      res.json({
        message: 'Environment stop initiated',
        status: 'STOPPING',
      });
      return;
    } catch (error) {
      logger.error('Failed to stop environment', { environmentId, error });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}/restart:
 *   post:
 *     summary: Restart environment
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment restart initiated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.post(
  '/:environmentId/restart',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    // Restart environment in Kubernetes (stop then start)
    try {
      await kubernetesService.stopEnvironment(environmentId);

      // Wait a moment before starting
      setTimeout(async () => {
        try {
          await kubernetesService.startEnvironment(environmentId);
        } catch (error) {
          logger.error('Failed to start environment after restart', { environmentId, error });
        }
      }, 2000);

      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'RESTARTING' },
      });

      res.json({
        message: 'Environment restart initiated',
        status: 'RESTARTING',
      });
    } catch (error) {
      logger.error('Failed to restart environment', { environmentId, error });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}/logs:
 *   get:
 *     summary: Get environment logs
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *       - in: query
 *         name: lines
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of log lines to retrieve
 *       - in: query
 *         name: follow
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Follow logs (stream mode)
 *     responses:
 *       200:
 *         description: Environment logs retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.get(
  '/:environmentId/logs',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    const lines = Math.min(parseInt(req.query.lines as string) || 100, 1000);
    const follow = req.query.follow === 'true';

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    try {
      const logs = await kubernetesService.getEnvironmentLogs(environmentId, lines, follow);

      if (follow) {
        // For streaming logs, set appropriate headers
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }

      res.json({
        environmentId,
        logs,
        lines: logs.split('\n').length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get environment logs', { environmentId, error });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/v1/environments/{environmentId}/metrics:
 *   get:
 *     summary: Get environment metrics
 *     tags: [Environments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: environmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Environment ID
 *     responses:
 *       200:
 *         description: Environment metrics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Environment not found
 */
router.get(
  '/:environmentId/metrics',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { environmentId } = req.params;

    if (!environmentId) {
      throw new ValidationError('Environment ID is required', []);
    }

    // Find environment and verify ownership
    const environment = await prisma.environment.findFirst({
      where: {
        id: environmentId,
        userId: authReq.user.id,
      },
    });

    if (!environment) {
      throw new NotFoundError('Environment not found');
    }

    try {
      // Get current metrics from Kubernetes
      const kubernetesInfo = await kubernetesService.getEnvironmentInfo(environmentId);

      // Get historical metrics from database
      const metrics = await prisma.environmentMetric.findMany({
        where: { environmentId },
        orderBy: { timestamp: 'desc' },
        take: 100, // Last 100 data points
      });

      // Update environment with latest metrics
      if (kubernetesInfo.cpuUsage !== undefined || kubernetesInfo.memoryUsage !== undefined) {
        const updateData: any = {
          lastActivityAt: new Date(),
        };
        if (kubernetesInfo.cpuUsage !== undefined) updateData.cpuUsage = kubernetesInfo.cpuUsage;
        if (kubernetesInfo.memoryUsage !== undefined)
          updateData.memoryUsage = kubernetesInfo.memoryUsage;
        if (kubernetesInfo.storageUsage !== undefined)
          updateData.storageUsage = kubernetesInfo.storageUsage;

        await prisma.environment.update({
          where: { id: environmentId },
          data: updateData,
        });
      }

      res.json({
        environmentId,
        status: kubernetesInfo.status,
        current: {
          cpuUsage: kubernetesInfo.cpuUsage,
          memoryUsage: kubernetesInfo.memoryUsage,
          storageUsage: kubernetesInfo.storageUsage,
          timestamp: new Date().toISOString(),
        },
        historical: metrics.map(metric => ({
          cpuUsage: metric.cpuUsage,
          memoryUsage: metric.memoryUsage,
          storageUsage: metric.storageUsage,
          networkIn: Number(metric.networkRx),
          networkOut: Number(metric.networkTx),
          timestamp: metric.timestamp,
        })),
        resources: {
          limits: {
            cpu: environment.resourcesCpu,
            memory: environment.resourcesMemory,
            storage: environment.resourcesStorage,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get environment metrics', { environmentId, error });
      throw error;
    }
  })
);

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database';
import { Prisma, TemplateCategory, TemplateStatus } from '@prisma/client';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, AuthenticatedRequest, requireAdmin } from '@/middleware/auth';
import { ValidationError, NotFoundError, ConflictError } from '@/types/errors';
import logger from '@/config/logger';

const router: Router = Router();

// Validation schemas
const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, 'Template name is required')
    .max(50, 'Template name must be less than 50 characters')
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      'Template name can only contain letters, numbers, hyphens, and underscores'
    ),
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(100, 'Display name must be less than 100 characters'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(1000, 'Description must be less than 1000 characters'),
  category: z.enum(['PROGRAMMING_LANGUAGE', 'FRAMEWORK', 'DATABASE', 'DEVOPS', 'OPERATING_SYSTEM']),
  tags: z.array(z.string()).default([]),
  dockerImage: z.string().min(1, 'Docker image is required'),
  defaultPort: z.number().int().min(1).max(65535).default(8080),
  defaultResourcesCpu: z
    .string()
    .regex(/^\d+m?$/, 'Invalid CPU format')
    .default('500m'),
  defaultResourcesMemory: z
    .string()
    .regex(/^\d+[GMK]i?$/, 'Invalid memory format')
    .default('1Gi'),
  defaultResourcesStorage: z
    .string()
    .regex(/^\d+[GMK]i?$/, 'Invalid storage format')
    .default('10Gi'),
  environmentVariables: z.record(z.string()).default({}),
  startupCommands: z.array(z.string()).default([]),
  documentationUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  status: z.enum(['ACTIVE', 'DEPRECATED', 'BETA']).default('ACTIVE'),
  version: z.string().default('1.0.0'),
});

/**
 * @swagger
 * /api/v1/templates:
 *   get:
 *     summary: List all available templates
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [PROGRAMMING_LANGUAGE, FRAMEWORK, DATABASE, DEVOPS, OPERATING_SYSTEM]
 *         description: Filter by template category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, DEPRECATED, BETA]
 *         description: Filter by template status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search templates by name or description
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of templates to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of templates to skip
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Template'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { category, status, search } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Handle both page-based and offset-based pagination
    let offset = parseInt(req.query.offset as string) || 0;
    const page = parseInt(req.query.page as string);
    if (page && page > 0) {
      offset = (page - 1) * limit;
    }

    const where: Prisma.TemplateWhereInput = {};
    
    // Only show active templates by default (unless includeDeprecated query param is true)
    if (req.query.includeDeprecated !== 'true') {
      where.status = TemplateStatus.ACTIVE;
    }

    if (category && typeof category === 'string' && Object.values(TemplateCategory).includes(category as TemplateCategory)) {
      where.category = category as TemplateCategory;
    }

    if (status && typeof status === 'string' && Object.values(TemplateStatus).includes(status as TemplateStatus)) {
      where.status = status as TemplateStatus;
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          category: true,
          tags: true,
          dockerImage: true,
          defaultPort: true,
          defaultResourcesCpu: true,
          defaultResourcesMemory: true,
          defaultResourcesStorage: true,
          environmentVariables: true,
          startupCommands: true,
          documentationUrl: true,
          iconUrl: true,
          status: true,
          version: true,
          usageCount: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.template.count({ where }),
    ]);

    res.json({
      templates,
      pagination: {
        total,
        limit,
        offset,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    });
  })
);

/**
 * @swagger
 * /api/v1/templates/categories:
 *   get:
 *     summary: Get all template categories with counts
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 */
router.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const categories = await prisma.template.groupBy({
      by: ['category'],
      where: {
        status: 'ACTIVE',
      },
      _count: {
        category: true,
      },
    });

    res.json({
      categories: categories.map(cat => ({
        name: cat.category,
        count: cat._count.category,
      })),
    });
  })
);

/**
 * @swagger
 * /api/v1/templates/popular:
 *   get:
 *     summary: Get most popular templates
 *     tags: [Templates]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of popular templates to return
 *     responses:
 *       200:
 *         description: Popular templates retrieved successfully
 */
router.get(
  '/popular',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const templates = await prisma.template.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        category: true,
        tags: true,
        dockerImage: true,
        defaultPort: true,
        iconUrl: true,
        usageCount: true,
      },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });

    res.json({ templates });
  })
);

/**
 * @swagger
 * /api/v1/templates/search:
 *   get:
 *     summary: Advanced template search
 *     tags: [Templates]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Filter by tags (comma-separated)
 *       - in: query
 *         name: fuzzy
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Enable fuzzy search
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 */
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const { q, category, tags, fuzzy } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Handle both page-based and offset-based pagination
    let offset = parseInt(req.query.offset as string) || 0;
    const page = parseInt(req.query.page as string);
    if (page && page > 0) {
      offset = (page - 1) * limit;
    }

    const where: Prisma.TemplateWhereInput = {
      status: TemplateStatus.ACTIVE,
    };

    if (category && typeof category === 'string' && Object.values(TemplateCategory).includes(category as TemplateCategory)) {
      where.category = category as TemplateCategory;
    }

    if (tags && typeof tags === 'string') {
      const tagList = tags.split(',').map(tag => tag.trim());
      where.tags = {
        hasEvery: tagList,
      };
    }

    if (q && typeof q === 'string') {
      if (fuzzy === 'true') {
        // Simple fuzzy search using contains with case insensitive
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { hasSome: [q] } },
        ];
      } else {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { displayName: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ];
      }
    }

    const [templates, total] = await Promise.all([
      prisma.template.findMany({
        where,
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          category: true,
          tags: true,
          dockerImage: true,
          defaultPort: true,
          iconUrl: true,
          usageCount: true,
          createdAt: true,
        },
        orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.template.count({ where }),
    ]);

    res.json({
      templates,
      pagination: {
        total,
        limit,
        offset,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    });
  })
);

/**
 * @swagger
 * /api/v1/templates/{templateId}:
 *   get:
 *     summary: Get specific template details
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 */
router.get(
  '/:templateId',
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;

    if (!templateId) {
      throw new ValidationError('Template ID is required', []);
    }

    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: {
        _count: {
          select: {
            environments: {
              where: {
                status: { notIn: ['TERMINATED'] },
              },
            },
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Check if user can access this template
    // Only allow deprecated templates if explicitly requested
    if (template.status === 'DEPRECATED' && req.query.includeDeprecated !== 'true') {
      throw new NotFoundError('Template not found');
    }

    res.json({
      ...template,
      activeEnvironmentCount: template._count.environments,
      _count: undefined, // Remove the count object from response
    });
  })
);

/**
 * @swagger
 * /api/v1/templates:
 *   post:
 *     summary: Create a new template (Admin only)
 *     tags: [Templates]
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
 *               - displayName
 *               - description
 *               - category
 *               - dockerImage
 *             properties:
 *               name:
 *                 type: string
 *                 example: python-3.11
 *               displayName:
 *                 type: string
 *                 example: Python 3.11
 *               description:
 *                 type: string
 *                 example: Python 3.11 development environment
 *               category:
 *                 type: string
 *                 enum: [PROGRAMMING_LANGUAGE, FRAMEWORK, DATABASE, DEVOPS, OPERATING_SYSTEM]
 *                 example: PROGRAMMING_LANGUAGE
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["python", "web", "data-science"]
 *               dockerImage:
 *                 type: string
 *                 example: python:3.11-slim
 *               defaultPort:
 *                 type: integer
 *                 example: 8080
 *               defaultResourcesCpu:
 *                 type: string
 *                 example: 500m
 *               defaultResourcesMemory:
 *                 type: string
 *                 example: 1Gi
 *               defaultResourcesStorage:
 *                 type: string
 *                 example: 10Gi
 *               environmentVariables:
 *                 type: object
 *                 example:
 *                   PYTHONPATH: "/app"
 *                   PYTHONUNBUFFERED: "1"
 *               startupCommands:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["pip install --upgrade pip"]
 *               documentationUrl:
 *                 type: string
 *                 example: https://docs.python.org/3.11/
 *               iconUrl:
 *                 type: string
 *                 example: https://www.python.org/static/img/python-logo.png
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Template already exists
 */
router.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const validationResult = createTemplateSchema.safeParse(req.body);
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

    const templateData = validationResult.data;

    // Check if template name already exists
    const existingTemplate = await prisma.template.findUnique({
      where: { name: templateData.name },
    });

    if (existingTemplate) {
      throw new ConflictError('Template with this name already exists');
    }

    // Prepare safe data for Prisma
    const safeTemplateData: Prisma.TemplateCreateInput = {
      name: templateData.name,
      displayName: templateData.displayName,
      description: templateData.description,
      category: templateData.category,
      dockerImage: templateData.dockerImage,
      defaultPort: templateData.defaultPort,
      defaultResourcesCpu: templateData.defaultResourcesCpu,
      defaultResourcesMemory: templateData.defaultResourcesMemory,
      defaultResourcesStorage: templateData.defaultResourcesStorage,
      environmentVariables: templateData.environmentVariables,
      startupCommands: templateData.startupCommands,
      status: templateData.status,
      ...(templateData.tags && { tags: templateData.tags }),
      ...(templateData.documentationUrl && { documentationUrl: templateData.documentationUrl }),
      ...(templateData.iconUrl && { iconUrl: templateData.iconUrl }),
      ...(templateData.version && { version: templateData.version }),
    };

    // Create template
    const template = await prisma.template.create({
      data: safeTemplateData,
    });

    logger.info('Template created', {
      templateId: template.id,
      name: template.name,
      createdBy: authReq.user.id,
    });

    res.status(201).json(template);
  })
);

/**
 * @swagger
 * /api/v1/templates/initialize:
 *   post:
 *     summary: Initialize default templates (Admin only)
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default templates initialized
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post(
  '/initialize',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const defaultTemplates = [
      {
        name: 'python-3.11',
        displayName: 'Python 3.11',
        description:
          'Python 3.11 development environment with pip, virtualenv, and popular packages',
        category: 'PROGRAMMING_LANGUAGE' as const,
        tags: ['python', 'web', 'data-science', 'api'],
        dockerImage: 'python:3.11-slim',
        defaultPort: 8080,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: {
          PYTHONPATH: '/app',
          PYTHONUNBUFFERED: '1',
          PIP_NO_CACHE_DIR: '1',
        },
        startupCommands: [
          'apt-get update && apt-get install -y git curl',
          'pip install --upgrade pip',
          'pip install flask fastapi uvicorn django',
        ],
        documentationUrl: 'https://docs.python.org/3.11/',
        iconUrl: 'https://www.python.org/static/img/python-logo.png',
      },
      {
        name: 'nodejs-18',
        displayName: 'Node.js 18 LTS',
        description: 'Node.js 18 LTS development environment with npm, yarn, and popular packages',
        category: 'PROGRAMMING_LANGUAGE' as const,
        tags: ['nodejs', 'javascript', 'web', 'api', 'fullstack'],
        dockerImage: 'node:18-slim',
        defaultPort: 3000,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: {
          NODE_ENV: 'development',
          NPM_CONFIG_UPDATE_NOTIFIER: 'false',
        },
        startupCommands: [
          'apt-get update && apt-get install -y git curl',
          'npm install -g yarn typescript ts-node nodemon',
          'npm install -g @nestjs/cli create-react-app',
        ],
        documentationUrl: 'https://nodejs.org/en/docs/',
        iconUrl: 'https://nodejs.org/static/images/logo.svg',
      },
      {
        name: 'go-1.21',
        displayName: 'Go 1.21',
        description: 'Go 1.21 development environment with development tools',
        category: 'PROGRAMMING_LANGUAGE' as const,
        tags: ['go', 'golang', 'api', 'microservices', 'cloud'],
        dockerImage: 'golang:1.21-alpine',
        defaultPort: 8080,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: {
          GO111MODULE: 'on',
          GOPROXY: 'https://proxy.golang.org',
        },
        startupCommands: [
          'apk add --no-cache git curl',
          'go install github.com/cosmtrek/air@latest',
          'go install github.com/go-delve/delve/cmd/dlv@latest',
        ],
        documentationUrl: 'https://golang.org/doc/',
        iconUrl: 'https://golang.org/lib/godoc/images/go-logo-blue.svg',
      },
      {
        name: 'ubuntu-22.04',
        displayName: 'Ubuntu 22.04 LTS',
        description: 'Ubuntu 22.04 LTS base environment with essential development tools',
        category: 'OPERATING_SYSTEM' as const,
        tags: ['ubuntu', 'linux', 'base', 'development'],
        dockerImage: 'ubuntu:22.04',
        defaultPort: 8080,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: {
          DEBIAN_FRONTEND: 'noninteractive',
          TZ: 'UTC',
        },
        startupCommands: [
          'apt-get update && apt-get install -y curl wget git vim nano htop build-essential',
          'apt-get install -y python3 python3-pip nodejs npm',
          'apt-get clean && rm -rf /var/lib/apt/lists/*',
        ],
        documentationUrl: 'https://ubuntu.com/server/docs',
        iconUrl: 'https://assets.ubuntu.com/v1/29985a98-ubuntu-logo32.png',
      },
    ];

    let createdCount = 0;
    const errors: string[] = [];

    for (const templateData of defaultTemplates) {
      try {
        // Check if template already exists
        const existingTemplate = await prisma.template.findUnique({
          where: { name: templateData.name },
        });

        if (!existingTemplate) {
          await prisma.template.create({
            data: templateData,
          });
          createdCount++;
          logger.info('Default template created', { name: templateData.name });
        } else {
          logger.info('Default template already exists', { name: templateData.name });
        }
      } catch (error) {
        const errorMessage = `Failed to create template ${templateData.name}: ${error}`;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    res.json({
      message: 'Default templates initialization completed',
      created: createdCount,
      skipped: defaultTemplates.length - createdCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  })
);

/**
 * @swagger
 * /api/v1/templates/{templateId}/compatibility:
 *   get:
 *     summary: Check template compatibility with user subscription
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Compatibility information retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 */
router.get(
  '/:templateId/compatibility',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { templateId } = req.params;

    const template = await prisma.template.findUnique({
      where: { id: templateId! },
      select: {
        id: true,
        name: true,
        displayName: true,
        status: true,
        defaultResourcesCpu: true,
        defaultResourcesMemory: true,
        defaultResourcesStorage: true,
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Simple compatibility logic based on subscription plan
    const userPlan = authReq.user.subscriptionPlan;
    const isCompatible =
      userPlan === 'PRO' ||
      userPlan === 'STARTER' ||
      (userPlan === 'FREE' && template.status === 'ACTIVE');

    res.json({
      templateId: template.id,
      name: template.name,
      displayName: template.displayName,
      compatible: isCompatible,
      userPlan,
      requirements: {
        cpu: template.defaultResourcesCpu,
        memory: template.defaultResourcesMemory,
        storage: template.defaultResourcesStorage,
      },
      limitations: userPlan === 'FREE' ? ['Limited to 1 environment', 'Basic support only'] : [],
    });
  })
);

/**
 * @swagger
 * /api/v1/templates/{templateId}/stats:
 *   get:
 *     summary: Get template usage statistics
 *     tags: [Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Template not found
 */
router.get(
  '/:templateId/stats',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;

    const template = await prisma.template.findUnique({
      where: { id: templateId! },
      select: {
        id: true,
        name: true,
        displayName: true,
        usageCount: true,
        createdAt: true,
        _count: {
          select: {
            environments: {
              where: {
                status: { notIn: ['TERMINATED'] },
              },
            },
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundError('Template not found');
    }

    // Calculate some basic stats
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentEnvironments = await prisma.environment.count({
      where: {
        templateId: templateId!,
        createdAt: {
          gte: last30Days,
        },
      },
    });

    res.json({
      templateId: template.id,
      name: template.name,
      displayName: template.displayName,
      totalUsage: template.usageCount,
      activeEnvironments: template._count.environments,
      recentUsage: {
        last30Days: recentEnvironments,
      },
      createdAt: template.createdAt,
    });
  })
);

// TODO: Implement remaining template routes
// - PUT /:templateId (update template)
// - DELETE /:templateId (delete/deprecate template)

export default router;

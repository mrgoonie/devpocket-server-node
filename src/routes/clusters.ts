import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';
import { authenticate, AuthenticatedRequest, requireAdmin } from '@/middleware/auth';
import { ValidationError, NotFoundError, ConflictError } from '@/types/errors';
import logger from '@/config/logger';

const router = Router();

// Validation schemas
const createClusterSchema = z.object({
  name: z.string()
    .min(1, 'Cluster name is required')
    .max(50, 'Cluster name must be less than 50 characters')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Cluster name can only contain letters, numbers, hyphens, and underscores'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  provider: z.string().default('ovh'),
  region: z.string().min(1, 'Region is required'),
  kubeconfig: z.string().min(1, 'Kubeconfig is required'),
});

/**
 * @swagger
 * /api/v1/clusters:
 *   get:
 *     summary: List all clusters (Admin only)
 *     tags: [Clusters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clusters retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/', authenticate, requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
  const clusters = await prisma.cluster.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      provider: true,
      region: true,
      status: true,
      nodeCount: true,
      createdAt: true,
      updatedAt: true,
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
    orderBy: { createdAt: 'desc' },
  });

  const formattedClusters = clusters.map(cluster => ({
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    provider: cluster.provider,
    region: cluster.region,
    status: cluster.status,
    nodeCount: cluster.nodeCount,
    activeEnvironments: cluster._count.environments,
    createdAt: cluster.createdAt,
    updatedAt: cluster.updatedAt,
  }));

  res.json({
    clusters: formattedClusters,
  });
}));

/**
 * @swagger
 * /api/v1/clusters/{clusterId}:
 *   get:
 *     summary: Get specific cluster details (Admin only)
 *     tags: [Clusters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clusterId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cluster ID
 *     responses:
 *       200:
 *         description: Cluster details retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Cluster not found
 */
router.get('/:clusterId', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { clusterId } = req.params;

  if (!clusterId) {
    throw new ValidationError('Cluster ID is required', []);
  }

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
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
      environments: {
        select: {
          id: true,
          name: true,
          status: true,
          userId: true,
          user: {
            select: {
              username: true,
              email: true,
            },
          },
          createdAt: true,
        },
        where: {
          status: { notIn: ['TERMINATED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10, // Show latest 10 environments
      },
    },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster not found');
  }

  res.json({
    id: cluster.id,
    name: cluster.name,
    description: cluster.description,
    provider: cluster.provider,
    region: cluster.region,
    status: cluster.status,
    nodeCount: cluster.nodeCount,
    createdAt: cluster.createdAt,
    updatedAt: cluster.updatedAt,
    activeEnvironments: cluster._count.environments,
    recentEnvironments: cluster.environments,
  });
}));

/**
 * @swagger
 * /api/v1/clusters:
 *   post:
 *     summary: Create a new cluster (Admin only)
 *     tags: [Clusters]
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
 *               - region
 *               - kubeconfig
 *             properties:
 *               name:
 *                 type: string
 *                 example: production-cluster
 *               description:
 *                 type: string
 *                 example: Production Kubernetes cluster
 *               provider:
 *                 type: string
 *                 example: ovh
 *               region:
 *                 type: string
 *                 example: GRA7
 *               kubeconfig:
 *                 type: string
 *                 example: base64_encoded_kubeconfig_content
 *     responses:
 *       201:
 *         description: Cluster created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       409:
 *         description: Cluster already exists
 */
router.post('/', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const validationResult = createClusterSchema.safeParse(req.body);
  if (!validationResult.success) {
    throw new ValidationError('Validation failed', validationResult.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    })));
  }

  const { name, description, provider, region, kubeconfig } = validationResult.data;

  // Check if cluster name already exists
  const existingCluster = await prisma.cluster.findUnique({
    where: { name },
  });

  if (existingCluster) {
    throw new ConflictError('Cluster with this name already exists');
  }

  // TODO: Validate kubeconfig and encrypt it
  // const encryptedKubeconfig = await encryptionService.encrypt(kubeconfig);
  const encryptedKubeconfig = kubeconfig; // Placeholder - should be encrypted

  // Create cluster
  const cluster = await prisma.cluster.create({
    data: {
      name,
      ...(description && { description }),
      provider,
      region,
      kubeconfig: encryptedKubeconfig,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      description: true,
      provider: true,
      region: true,
      status: true,
      nodeCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info('Cluster created', {
    clusterId: cluster.id,
    name: cluster.name,
    region: cluster.region,
    createdBy: (req as AuthenticatedRequest).user.id,
  });

  res.status(201).json(cluster);
}));

/**
 * @swagger
 * /api/v1/clusters/regions:
 *   get:
 *     summary: Get available regions for cluster deployment (Admin only)
 *     tags: [Clusters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available regions retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/regions', authenticate, requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
  // This would typically come from cloud provider APIs
  // For now, return static OVH regions
  const regions = [
    {
      name: 'GRA7',
      displayName: 'Gravelines 7',
      country: 'France',
      provider: 'ovh',
    },
    {
      name: 'SBG5',
      displayName: 'Strasbourg 5',
      country: 'France',
      provider: 'ovh',
    },
    {
      name: 'UK1',
      displayName: 'London 1',
      country: 'United Kingdom',
      provider: 'ovh',
    },
    {
      name: 'WAW1',
      displayName: 'Warsaw 1',
      country: 'Poland',
      provider: 'ovh',
    },
  ];

  res.json({
    regions,
  });
}));

/**
 * @swagger
 * /api/v1/clusters/{clusterId}/health:
 *   get:
 *     summary: Check cluster health status (Admin only)
 *     tags: [Clusters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clusterId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cluster ID
 *     responses:
 *       200:
 *         description: Cluster health check results
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Cluster not found
 */
router.get('/:clusterId/health', authenticate, requireAdmin, asyncHandler(async (req: Request, res: Response) => {
  const { clusterId } = req.params;

  if (!clusterId) {
    throw new ValidationError('Cluster ID is required', []);
  }

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      name: true,
      status: true,
      kubeconfig: true,
    },
  });

  if (!cluster) {
    throw new NotFoundError('Cluster not found');
  }

  // TODO: Implement actual Kubernetes health check
  // const healthStatus = await kubernetesService.checkClusterHealth(cluster.kubeconfig);

  // Mock health check for now
  const healthStatus = {
    status: cluster.status === 'ACTIVE' ? 'healthy' : 'unhealthy',
    nodes: 3,
    readyNodes: 3,
    cpuUsage: 45.2,
    memoryUsage: 67.8,
    storageUsage: 23.1,
    lastCheck: new Date().toISOString(),
    components: [
      {
        name: 'api-server',
        status: 'healthy',
        message: 'API server is responsive',
      },
      {
        name: 'node-pool',
        status: 'healthy',
        message: 'All nodes are ready',
      },
      {
        name: 'storage',
        status: 'healthy',
        message: 'Storage is available',
      },
    ],
  };

  res.json({
    clusterId: cluster.id,
    clusterName: cluster.name,
    ...healthStatus,
  });
}));

// TODO: Implement remaining cluster routes
// - PUT /:clusterId (update cluster)
// - DELETE /:clusterId (delete cluster)
// - POST /:clusterId/nodes (add nodes)
// - DELETE /:clusterId/nodes/:nodeId (remove node)

export default router;

import { Router, Request, Response } from 'express';
import { getConfig } from '@/config/env';
import db from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';

const router: Router = Router();
const config = getConfig();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the overall health status of the API
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 service:
 *                   type: string
 *                   example: DevPocket API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 *                 environment:
 *                   type: string
 *                   example: production
 *                 timestamp:
 *                   type: number
 *                   example: 1672531200.0
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    service: config.APP_NAME,
    version: '1.0.0',
    environment: config.NODE_ENV,
    timestamp: Date.now() / 1000,
  };

  res.json(health);
}));

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check for Kubernetes
 *     description: Returns readiness status including database connectivity
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ready
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: healthy
 *       503:
 *         description: Service is not ready
 */
router.get('/ready', asyncHandler(async (_req: Request, res: Response) => {
  const checks = {
    database: 'unknown',
  };

  // Check database connectivity
  try {
    const isDbHealthy = await db.healthCheck();
    checks.database = isDbHealthy ? 'healthy' : 'unhealthy';
  } catch (error) {
    checks.database = 'unhealthy';
  }

  const isReady = Object.values(checks).every(status => status === 'healthy');
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not ready',
    checks,
  });
}));

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check for Kubernetes
 *     description: Returns basic liveness status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: alive
 */
router.get('/live', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    status: 'alive',
  });
}));

export default router;

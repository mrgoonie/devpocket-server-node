import { Router, Request, Response } from 'express';
import { getConfig } from '@/config/env';
import db from '@/config/database';
import { asyncHandler } from '@/middleware/errorHandler';
import serverInfo from '@/utils/serverInfo';
import { readFileSync } from 'fs';
import { join } from 'path';

const router: Router = Router();
const config = getConfig();

// Function to get version from package.json
function getVersionFromPackageJson(): string {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version || '1.0.0';
  } catch (error) {
    // Fallback to default version if package.json cannot be read
    return '1.0.0';
  }
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the overall health status of the API including server start time and uptime
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
 *                 startTime:
 *                   type: number
 *                   description: Server start time as Unix timestamp
 *                   example: 1672530000.0
 *                 uptime:
 *                   type: string
 *                   description: Human-readable server uptime
 *                   example: "2 hours, 15 minutes, 30 seconds"
 *     security: []
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const health = {
      status: 'healthy',
      service: config.APP_NAME,
      version: getVersionFromPackageJson(),
      environment: config.NODE_ENV,
      timestamp: Date.now() / 1000,
      startTime: serverInfo.getStartTimeUnix(),
      uptime: serverInfo.getUptimeFormatted(),
    };

    res.json(health);
  })
);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: not ready
 *                 checks:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: unhealthy
 *     security: []
 */
router.get(
  '/ready',
  asyncHandler(async (_req: Request, res: Response) => {
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
  })
);

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
 *     security: []
 */
router.get(
  '/live',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      status: 'alive',
    });
  })
);

export default router;

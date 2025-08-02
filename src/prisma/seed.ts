#!/usr/bin/env tsx

import 'dotenv/config';
import { PrismaClient, SubscriptionPlan, ClusterStatus } from '@prisma/client';
import { hashPassword } from '@/utils/password';
import { loadAllTemplates } from '@/scripts/load_templates';
import { kubeconfigService } from '@/utils/kubeconfig';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';
import path from 'path';

const prisma = new PrismaClient();

async function seedUsers() {
  logger.info('Seeding users...');
  
  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@devpocket.app' },
    update: {},
    create: {
      email: 'admin@devpocket.app',
      username: 'admin',
      fullName: 'DevPocket Administrator',
      password: await hashPassword('AdminPassword123!'),
      subscriptionPlan: SubscriptionPlan.ENTERPRISE,
      isActive: true,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@devpocket.app' },
    update: {},
    create: {
      email: 'demo@devpocket.app',
      username: 'demo',
      fullName: 'Demo User',
      password: await hashPassword('DemoPassword123!'),
      subscriptionPlan: SubscriptionPlan.PRO,
      isActive: true,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@devpocket.app' },
    update: {},
    create: {
      email: 'test@devpocket.app',
      username: 'testuser',
      fullName: 'Test User',
      password: await hashPassword('TestPassword123!'),
      subscriptionPlan: SubscriptionPlan.FREE,
      isActive: true,
      isVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  logger.info(`Created/updated users: ${adminUser.id}, ${demoUser.id}, ${testUser.id}`);
  
  return { adminUser, demoUser, testUser };
}

async function seedClusters() {
  logger.info('Seeding clusters from real kubeconfig data...');
  
  try {
    // Path to the kubeconfig file
    const kubeconfigPath = path.join(process.cwd(), 'k8s', 'kube_config_ovh.yaml');
    
    // Parse the kubeconfig file
    const clusterDataList = await kubeconfigService.parseKubeconfigFile(kubeconfigPath);
    
    if (clusterDataList.length === 0) {
      logger.warn('No clusters found in kubeconfig, falling back to mock data');
      return await seedMockClusters();
    }

    // Validate connectivity for all clusters
    const kubeconfigContent = require('fs').readFileSync(kubeconfigPath, 'utf8');
    const validationResult = await kubeconfigService.validateKubeconfigConnectivity(kubeconfigContent);
    
    logger.info('Cluster connectivity validation results:', {
      valid: validationResult.valid,
      clusters: validationResult.clusters.map(c => ({
        name: c.name,
        connected: c.connected,
        nodeCount: c.nodeCount,
        error: c.error
      }))
    });

    const seededClusters: any = {};

    // Create/update clusters from real kubeconfig data
    for (const clusterData of clusterDataList) {
      try {
        // Encrypt the kubeconfig content
        const encryptedKubeconfig = encryptionService.encrypt(clusterData.kubeconfig);
        
        // Find validation data for this cluster
        const validationData = validationResult.clusters.find(c => c.name === clusterData.name);
        const nodeCount = validationData?.nodeCount || 1;
        const isConnected = validationData?.connected || false;
        
        // Determine cluster status based on connectivity
        const status = isConnected ? ClusterStatus.ACTIVE : ClusterStatus.INACTIVE;
        
        const cluster = await prisma.cluster.upsert({
          where: { name: clusterData.name },
          update: {
            description: clusterData.description,
            provider: clusterData.provider,
            region: clusterData.region,
            kubeconfig: encryptedKubeconfig,
            status,
            nodeCount,
          },
          create: {
            name: clusterData.name,
            description: clusterData.description,
            provider: clusterData.provider,
            region: clusterData.region,
            kubeconfig: encryptedKubeconfig,
            status,
            nodeCount,
          },
        });

        seededClusters[clusterData.name] = cluster;
        
        logger.info('Cluster seeded successfully', {
          name: cluster.name,
          provider: cluster.provider,
          region: cluster.region,
          status: cluster.status,
          nodeCount: cluster.nodeCount,
          connected: isConnected
        });
      } catch (error) {
        logger.error('Failed to seed cluster', {
          clusterName: clusterData.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const clusterCount = Object.keys(seededClusters).length;
    logger.info(`Successfully seeded ${clusterCount} clusters from kubeconfig`);
    
    // Return in expected format for backwards compatibility
    const clusterEntries = Object.values(seededClusters);
    return {
      defaultCluster: clusterEntries[0] || null,
      stagingCluster: clusterEntries[1] || clusterEntries[0] || null,
      allClusters: seededClusters
    };
    
  } catch (error) {
    logger.error('Failed to seed clusters from kubeconfig, falling back to mock data', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    // Fallback to mock data if kubeconfig parsing fails
    return await seedMockClusters();
  }
}

async function seedMockClusters() {
  logger.info('Seeding mock cluster data...');
  
  // Create default mock cluster
  const defaultCluster = await prisma.cluster.upsert({
    where: { name: 'default-cluster-mock' },
    update: {},
    create: {
      name: 'default-cluster-mock',
      description: 'Mock Kubernetes cluster for development (kubeconfig unavailable)',
      provider: 'ovh',
      region: 'eu-west-1',
      kubeconfig: encryptionService.encrypt('# Mock kubeconfig - replace with real cluster configuration'),
      status: ClusterStatus.INACTIVE,
      nodeCount: 1,
    },
  });

  // Create staging mock cluster
  const stagingCluster = await prisma.cluster.upsert({
    where: { name: 'staging-cluster-mock' },
    update: {},
    create: {
      name: 'staging-cluster-mock',
      description: 'Mock staging cluster for testing (kubeconfig unavailable)',
      provider: 'ovh',
      region: 'eu-west-1',
      kubeconfig: encryptionService.encrypt('# Mock kubeconfig - replace with real cluster configuration'),
      status: ClusterStatus.INACTIVE,
      nodeCount: 1,
    },
  });

  logger.info(`Created/updated mock clusters: ${defaultCluster.id}, ${stagingCluster.id}`);
  
  return { defaultCluster, stagingCluster };
}

async function seedTemplates() {
  logger.info('Seeding templates...');
  
  // Load all templates from YAML files in scripts/templates/
  await loadAllTemplates();
  
  // Get all templates from database to return for other seeding functions
  const templates = await prisma.template.findMany();
  
  logger.info(`Created/updated ${templates.length} templates`);
  
  return templates;
}

async function seedUserClusters(users: any, clusters: any) {
  logger.info('Seeding user-cluster relationships...');
  
  // Handle both new structure (with allClusters) and old structure
  const clusterList = clusters.allClusters ? Object.values(clusters.allClusters) : Object.values(clusters);
  
  // Give admin access to all clusters
  for (const cluster of clusterList) {
    try {
      await prisma.userCluster.upsert({
        where: {
          userId_clusterId: {
            userId: users.adminUser.id,
            clusterId: (cluster as any).id,
          },
        },
        update: {},
        create: {
          userId: users.adminUser.id,
          clusterId: (cluster as any).id,
          role: 'ADMIN',
        },
      });
      
      logger.debug('Admin access granted to cluster', {
        clusterId: (cluster as any).id,
        clusterName: (cluster as any).name
      });
    } catch (error) {
      logger.error('Failed to grant admin access to cluster', {
        clusterId: (cluster as any).id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Give demo and test users access to default cluster (if available)
  if (clusters.defaultCluster) {
    try {
      // Give demo user access to default cluster
      await prisma.userCluster.upsert({
        where: {
          userId_clusterId: {
            userId: users.demoUser.id,
            clusterId: clusters.defaultCluster.id,
          },
        },
        update: {},
        create: {
          userId: users.demoUser.id,
          clusterId: clusters.defaultCluster.id,
          role: 'USER',
        },
      });

      // Give test user access to default cluster
      await prisma.userCluster.upsert({
        where: {
          userId_clusterId: {
            userId: users.testUser.id,
            clusterId: clusters.defaultCluster.id,
          },
        },
        update: {},
        create: {
          userId: users.testUser.id,
          clusterId: clusters.defaultCluster.id,
          role: 'USER',
        },
      });
      
      logger.info('Demo and test users granted access to default cluster', {
        clusterId: clusters.defaultCluster.id,
        clusterName: clusters.defaultCluster.name
      });
    } catch (error) {
      logger.error('Failed to grant user access to default cluster', {
        clusterId: clusters.defaultCluster.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  } else {
    logger.warn('No default cluster available for demo/test users');
  }

  logger.info('User-cluster relationships seeding completed');
}

async function seedEnvironments(users: any, templates: any[], clusters: any) {
  logger.info('Seeding demo environments...');
  
  // Create demo environment for demo user
  const demoEnvironment = await prisma.environment.upsert({
    where: {
      userId_name: {
        userId: users.demoUser.id,
        name: 'my-nodejs-app',
      },
    },
    update: {},
    create: {
      name: 'my-nodejs-app',
      description: 'Demo Node.js application environment',
      userId: users.demoUser.id,
      templateId: templates.find(t => t.name === 'nodejs')?.id || templates.find(t => t.name.includes('node'))?.id || templates[0].id,
      clusterId: clusters.defaultCluster.id,
      dockerImage: 'node:18-alpine',
      port: 3000,
      resourcesCpu: '500m',
      resourcesMemory: '1Gi',
      resourcesStorage: '10Gi',
      environmentVariables: {
        NODE_ENV: 'development',
        APP_NAME: 'Demo App',
      },
      status: 'RUNNING',
      installationCompleted: true,
      lastActivityAt: new Date(),
    },
  });

  // Create test environment for test user
  const testEnvironment = await prisma.environment.upsert({
    where: {
      userId_name: {
        userId: users.testUser.id,
        name: 'python-playground',
      },
    },
    update: {},
    create: {
      name: 'python-playground',
      description: 'Python development playground',
      userId: users.testUser.id,
      templateId: templates.find(t => t.name === 'python')?.id || templates.find(t => t.name.includes('python'))?.id || templates[1]?.id || templates[0].id,
      clusterId: clusters.defaultCluster.id,
      dockerImage: 'python:3.11-slim',
      port: 8000,
      resourcesCpu: '500m',
      resourcesMemory: '1Gi',
      resourcesStorage: '5Gi',
      environmentVariables: {
        PYTHONPATH: '/workspace',
      },
      status: 'STOPPED',
      installationCompleted: true,
      lastActivityAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // Yesterday
    },
  });

  logger.info(`Created/updated environments: ${demoEnvironment.id}, ${testEnvironment.id}`);
  
  return { demoEnvironment, testEnvironment };
}

async function main() {
  try {
    logger.info('Starting database seeding...');
    
    // Seed in order due to foreign key dependencies
    const users = await seedUsers();
    const clusters = await seedClusters();
    const templates = await seedTemplates();
    
    await seedUserClusters(users, clusters);
    const environments = await seedEnvironments(users, templates, clusters);
    
    logger.info('Database seeding completed successfully');
    
    // Print summary
    console.log('\n=== Seeding Summary ===');
    console.log(`✅ Users: ${Object.keys(users).length} created/updated`);
    console.log(`✅ Clusters: ${Object.keys(clusters).length} created/updated`);
    console.log(`✅ Templates: ${templates.length} created/updated`);
    console.log(`✅ Environments: ${Object.keys(environments).length} created/updated`);
    console.log('\n🔑 Default Login Credentials:');
    console.log('Admin: admin@devpocket.app / AdminPassword123!');
    console.log('Demo:  demo@devpocket.app / DemoPassword123!');
    console.log('Test:  test@devpocket.app / TestPassword123!');
    
  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx src/prisma/seed.ts [options]

Options:
  --help, -h     Show this help message
  
Environment Variables:
  DATABASE_URL   PostgreSQL connection string
  
Description:
  Seeds the database with initial data including users, clusters, templates, and demo environments.
  Safe to run multiple times - will update existing records instead of creating duplicates.
  
Example:
  tsx src/prisma/seed.ts
  `);
  process.exit(0);
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main as seedDatabase };
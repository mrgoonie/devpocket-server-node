#!/usr/bin/env tsx

import 'dotenv/config';
import { PrismaClient, SubscriptionPlan, ClusterStatus } from '@prisma/client';
import { hashPassword } from '@/utils/password';
import { loadAllTemplates } from '@/scripts/load_templates';
import logger from '@/config/logger';

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
  logger.info('Seeding clusters...');
  
  // Create default cluster
  const defaultCluster = await prisma.cluster.upsert({
    where: { name: 'default-cluster' },
    update: {},
    create: {
      name: 'default-cluster',
      description: 'Default OVH Kubernetes cluster for development environments',
      provider: 'ovh',
      region: 'eu-west-1',
      kubeconfig: 'encrypted-kubeconfig-content-placeholder',
      status: ClusterStatus.ACTIVE,
      nodeCount: 3,
    },
  });

  // Create staging cluster
  const stagingCluster = await prisma.cluster.upsert({
    where: { name: 'staging-cluster' },
    update: {},
    create: {
      name: 'staging-cluster',
      description: 'Staging cluster for testing environments',
      provider: 'ovh',
      region: 'eu-west-1',
      kubeconfig: 'encrypted-staging-kubeconfig-content-placeholder',
      status: ClusterStatus.ACTIVE,
      nodeCount: 2,
    },
  });

  logger.info(`Created/updated clusters: ${defaultCluster.id}, ${stagingCluster.id}`);
  
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
  
  // Give admin access to all clusters
  for (const cluster of Object.values(clusters)) {
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
  }

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

  logger.info('User-cluster relationships created');
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
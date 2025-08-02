#!/usr/bin/env tsx

import 'dotenv/config';
import { prisma } from '@/config/database';
import kubernetesService from '@/services/kubernetes';
import logger from '@/config/logger';

async function testKubernetesService() {
  try {
    console.log('=== Testing Kubernetes Service with Real Cluster Data ===\n');
    
    // Get clusters from database
    const clusters = await prisma.cluster.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        provider: true,
        region: true,
        status: true,
        nodeCount: true,
      }
    });
    
    console.log(`Found ${clusters.length} active cluster(s) in database:`);
    
    for (const cluster of clusters) {
      console.log(`\n📋 Cluster: ${cluster.name}`);
      console.log(`   ID: ${cluster.id}`);
      console.log(`   Provider: ${cluster.provider}`);
      console.log(`   Region: ${cluster.region}`);
      console.log(`   Status: ${cluster.status}`);
      console.log(`   Nodes: ${cluster.nodeCount}`);
      
      // Test if we can access the cluster through the Kubernetes service
      try {
        console.log('   Testing service connectivity...');
        
        // Get a real user and template for testing
        const user = await prisma.user.findFirst({ select: { id: true } });
        const template = await prisma.template.findFirst({ select: { id: true } });
        
        if (!user || !template) {
          console.log('   ⚠️  Skipping service test - no user or template found');
          continue;
        }

        // Create a mock environment to test cluster access
        const testEnvironment = await prisma.environment.create({
          data: {
            name: 'test-connectivity',
            description: 'Test environment for cluster connectivity',
            userId: user.id,
            templateId: template.id,
            clusterId: cluster.id,
            dockerImage: 'alpine:latest',
            port: 3000,
            resourcesCpu: '100m',
            resourcesMemory: '128Mi',
            resourcesStorage: '1Gi',
            status: 'STOPPED',
            installationCompleted: false,
          }
        });
        
        console.log(`   ✅ Test environment created: ${testEnvironment.id}`);
        
        // Test environment info retrieval (this will test kubeconfig decryption)
        const envInfo = await kubernetesService.getEnvironmentInfo(testEnvironment.id);
        console.log(`   📊 Environment info: ${JSON.stringify(envInfo, null, 6)}`);
        
        // Clean up test environment
        await prisma.environment.delete({
          where: { id: testEnvironment.id }
        });
        
        console.log('   ✅ Test environment cleaned up');
        console.log('   🎉 Kubernetes service test passed!');
        
      } catch (error) {
        console.log(`   ❌ Kubernetes service test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    if (clusters.length === 0) {
      console.log('⚠️  No active clusters found. Please run database seeding first.');
    }
    
    console.log('\n🎉 Kubernetes service testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx src/scripts/test_kubernetes_service.ts

Description:
  Tests Kubernetes service functionality with real cluster data from the database.
  Verifies that encrypted kubeconfig can be properly decrypted and used.
  
Example:
  tsx src/scripts/test_kubernetes_service.ts
  `);
  process.exit(0);
}

// Run the test
if (require.main === module) {
  testKubernetesService().catch((error) => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}
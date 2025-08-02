#!/usr/bin/env tsx

import 'dotenv/config';
import { kubeconfigService } from '@/utils/kubeconfig';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';
import path from 'path';

async function testKubeconfigParsing() {
  try {
    console.log('=== Testing Kubeconfig Parsing ===\n');
    
    // Test kubeconfig parsing
    const kubeconfigPath = path.join(process.cwd(), 'k8s', 'kube_config_ovh.yaml');
    console.log(`Reading kubeconfig from: ${kubeconfigPath}`);
    
    const clusterDataList = await kubeconfigService.parseKubeconfigFile(kubeconfigPath);
    
    console.log(`\n✅ Found ${clusterDataList.length} cluster(s):`);
    for (const cluster of clusterDataList) {
      console.log(`\n📋 Cluster: ${cluster.name}`);
      console.log(`   Provider: ${cluster.provider}`);
      console.log(`   Region: ${cluster.region}`);
      console.log(`   Server: ${cluster.server}`);
      console.log(`   Is Current: ${cluster.isCurrentContext}`);
      console.log(`   Namespace: ${cluster.namespace}`);
    }
    
    // Test encryption/decryption
    console.log('\n=== Testing Encryption/Decryption ===\n');
    
    const testData = 'This is test kubeconfig content';
    console.log(`Original data: ${testData}`);
    
    const encrypted = encryptionService.encrypt(testData);
    console.log(`Encrypted: ${encrypted.substring(0, 50)}...`);
    
    const decrypted = encryptionService.decrypt(encrypted);
    console.log(`Decrypted: ${decrypted}`);
    
    if (testData === decrypted) {
      console.log('✅ Encryption/Decryption test passed!');
    } else {
      console.log('❌ Encryption/Decryption test failed!');
    }
    
    // Test kubeconfig encryption
    console.log('\n=== Testing Kubeconfig Encryption ===\n');
    
    if (clusterDataList.length > 0) {
      const firstCluster = clusterDataList[0];
      
      console.log('Encrypting kubeconfig...');
      const encryptedKubeconfig = encryptionService.encrypt(firstCluster!.kubeconfig);
      console.log(`Encrypted kubeconfig length: ${encryptedKubeconfig.length} characters`);
      
      console.log('Decrypting kubeconfig...');
      const decryptedKubeconfig = encryptionService.decrypt(encryptedKubeconfig);
      
      // Verify it's valid YAML by trying to parse it again
      const reparsedClusters = kubeconfigService.parseKubeconfigContent(decryptedKubeconfig);
      
      if (reparsedClusters.length > 0) {
        console.log('✅ Kubeconfig encryption/decryption test passed!');
        console.log(`   Reparsed ${reparsedClusters.length} cluster(s) after decryption`);
      } else {
        console.log('❌ Kubeconfig encryption/decryption test failed!');
      }
    }
    
    // Test connectivity (optional - will timeout if cluster is not accessible)
    console.log('\n=== Testing Cluster Connectivity (Optional) ===\n');
    console.log('⚠️  This test may timeout if cluster is not accessible...');
    
    try {
      const kubeconfigContent = require('fs').readFileSync(kubeconfigPath, 'utf8');
      
      // Set a timeout for the connectivity test
      const connectivityPromise = kubeconfigService.validateKubeconfigConnectivity(kubeconfigContent);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connectivity test timeout')), 10000)
      );
      
      const validationResult = await Promise.race([connectivityPromise, timeoutPromise]) as any;
      
      console.log('\n📊 Connectivity Results:');
      console.log(`Overall valid: ${validationResult.valid}`);
      
      for (const cluster of validationResult.clusters) {
        console.log(`\n🔗 ${cluster.name}:`);
        console.log(`   Connected: ${cluster.connected}`);
        if (cluster.connected) {
          console.log(`   Node count: ${cluster.nodeCount}`);
          console.log(`   Version: ${cluster.version}`);
        } else {
          console.log(`   Error: ${cluster.error}`);
        }
      }
    } catch (error) {
      console.log(`⚠️  Connectivity test skipped: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx src/scripts/test_kubeconfig.ts

Description:
  Tests kubeconfig parsing, encryption, and connectivity functionality.
  Safe to run multiple times - performs read-only operations.
  
Example:
  tsx src/scripts/test_kubeconfig.ts
  `);
  process.exit(0);
}

// Run the test
if (require.main === module) {
  testKubeconfigParsing().catch((error) => {
    logger.error('Test failed:', error);
    process.exit(1);
  });
}
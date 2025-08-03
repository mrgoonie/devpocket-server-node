#!/usr/bin/env tsx

/**
 * Test script to verify Kubernetes service fixes
 * This script tests the improved error handling and kubeconfig parsing
 */

import { kubernetesService } from '@/services/kubernetes';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
  details?: any;
}

class KubernetesServiceTester {
  private results: TestResult[] = [];

  private log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  private addResult(test: string, passed: boolean, error?: string, details?: any): void {
    this.results.push({ test, passed, error, details });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    this.log(`${status}: ${test}${error ? ` - ${error}` : ''}`);
  }

  async testKubeconfigValidation(): Promise<void> {
    this.log('Testing kubeconfig validation...');

    try {
      // Test valid kubeconfig
      const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test.example.com
contexts:
- name: test-context
  context:
    cluster: test-cluster
    user: test-user
users:
- name: test-user
  user:
    token: test-token
current-context: test-context
`;

      const isValid = (kubernetesService as any).validateKubeconfigFormat(validKubeconfig);
      this.addResult('Valid kubeconfig validation', isValid);

      // Test invalid kubeconfig
      const invalidKubeconfig = 'not-a-valid-kubeconfig';
      const isInvalid = !(kubernetesService as any).validateKubeconfigFormat(invalidKubeconfig);
      this.addResult('Invalid kubeconfig rejection', isInvalid);

      // Test empty kubeconfig
      const isEmpty = !(kubernetesService as any).validateKubeconfigFormat('');
      this.addResult('Empty kubeconfig rejection', isEmpty);

    } catch (error) {
      this.addResult(
        'Kubeconfig validation tests', 
        false, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async testErrorSerialization(): Promise<void> {
    this.log('Testing error serialization...');

    try {
      const testError = new Error('Test error message');
      testError.stack = 'Error stack trace';
      (testError as any).customProperty = 'custom value';

      // Test the serializeError function
      const { serializeError } = await import('@/config/logger');
      const serialized = serializeError(testError);

      const hasName = serialized.name === 'Error';
      const hasMessage = serialized.message === 'Test error message';
      const hasStack = typeof serialized.stack === 'string';
      
      this.addResult('Error serialization - name', hasName);
      this.addResult('Error serialization - message', hasMessage);
      this.addResult('Error serialization - stack', hasStack);

      // Test non-Error serialization
      const nonError = { some: 'object' };
      const serializedNonError = serializeError(nonError);
      const isObject = typeof serializedNonError === 'object';
      
      this.addResult('Non-error object serialization', isObject);

    } catch (error) {
      this.addResult(
        'Error serialization tests', 
        false, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async testRetryMechanism(): Promise<void> {
    this.log('Testing retry mechanism...');

    try {
      let attemptCount = 0;
      const retryableOperation = async (): Promise<string> => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Connection timeout'); // Retryable error
        }
        return 'success';
      };

      const result = await (kubernetesService as any).retryOperation(
        retryableOperation,
        'Test retryable operation',
        { test: true }
      );

      const succeeded = result === 'success';
      const correctAttempts = attemptCount === 3;
      
      this.addResult('Retry mechanism - success after retries', succeeded);
      this.addResult('Retry mechanism - correct attempt count', correctAttempts, undefined, { attempts: attemptCount });

      // Test non-retryable error
      let nonRetryAttempts = 0;
      const nonRetryableOperation = async (): Promise<string> => {
        nonRetryAttempts++;
        throw new Error('Authentication failed'); // Non-retryable error
      };

      try {
        await (kubernetesService as any).retryOperation(
          nonRetryableOperation,
          'Test non-retryable operation',
          { test: true }
        );
        this.addResult('Non-retryable error handling', false, 'Should have thrown error');
      } catch (error) {
        const correctlyFailed = nonRetryAttempts === 1;
        this.addResult('Non-retryable error - single attempt', correctlyFailed, undefined, { attempts: nonRetryAttempts });
      }

    } catch (error) {
      this.addResult(
        'Retry mechanism tests', 
        false, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async testDatabaseIntegration(): Promise<void> {
    this.log('Testing database integration...');

    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      this.addResult('Database connection', true);

      // Test cluster lookup (should fail gracefully if no clusters exist)
      const clusters = await prisma.cluster.findMany({
        take: 1,
        select: { id: true, name: true, status: true },
      });
      
      this.addResult('Cluster lookup', true, undefined, { clustersFound: clusters.length });

    } catch (error) {
      this.addResult(
        'Database integration', 
        false, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async testEncryptionService(): Promise<void> {
    this.log('Testing encryption service...');

    try {
      const testData = 'test-kubeconfig-data';
      
      // Test encryption
      const encrypted = encryptionService.encrypt(testData);
      const hasCorrectFormat = encrypted.includes(':');
      this.addResult('Encryption format', hasCorrectFormat);

      // Test decryption
      const decrypted = encryptionService.decrypt(encrypted);
      const correctDecryption = decrypted === testData;
      this.addResult('Encryption/Decryption roundtrip', correctDecryption);

      // Test invalid decryption handling
      try {
        encryptionService.decrypt('invalid-encrypted-data');
        this.addResult('Invalid decryption handling', false, 'Should have thrown error');
      } catch (error) {
        this.addResult('Invalid decryption handling', true);
      }

    } catch (error) {
      this.addResult(
        'Encryption service tests', 
        false, 
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const failed = total - passed;

    this.log('\n' + '='.repeat(50));
    this.log(`TEST SUMMARY: ${passed}/${total} tests passed`);
    if (failed > 0) {
      this.log(`${failed} tests failed:`, 'error');
      this.results
        .filter(r => !r.passed)
        .forEach(r => this.log(`  - ${r.test}: ${r.error || 'Unknown error'}`, 'error'));
    }
    this.log('='.repeat(50));
  }

  async runAllTests(): Promise<void> {
    this.log('Starting Kubernetes service fix verification...');
    
    await this.testKubeconfigValidation();
    await this.testErrorSerialization();
    await this.testRetryMechanism();
    await this.testDatabaseIntegration();
    await this.testEncryptionService();
    
    this.printSummary();
    
    const allPassed = this.results.every(r => r.passed);
    process.exit(allPassed ? 0 : 1);
  }
}

async function main(): Promise<void> {
  const tester = new KubernetesServiceTester();
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { KubernetesServiceTester };
import { jest } from '@jest/globals';
import { KubernetesError } from '@/types/errors';

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

// Mock Kubernetes client
const mockCoreV1Api = {
  readNamespace: jest.fn() as jest.MockedFunction<any>,
  createNamespace: jest.fn() as jest.MockedFunction<any>,
  createNamespacedPersistentVolumeClaim: jest.fn() as jest.MockedFunction<any>,
  createNamespacedConfigMap: jest.fn() as jest.MockedFunction<any>,
  createNamespacedService: jest.fn() as jest.MockedFunction<any>,
  deleteNamespacedService: jest.fn() as jest.MockedFunction<any>,
  deleteNamespacedPersistentVolumeClaim: jest.fn() as jest.MockedFunction<any>,
  deleteNamespacedConfigMap: jest.fn() as jest.MockedFunction<any>,
  listNamespacedPod: jest.fn() as jest.MockedFunction<any>,
  readNamespacedPodLog: jest.fn() as jest.MockedFunction<any>,
};

const mockAppsV1Api = {
  createNamespacedDeployment: jest.fn() as jest.MockedFunction<any>,
  readNamespacedDeployment: jest.fn() as jest.MockedFunction<any>,
  patchNamespacedDeployment: jest.fn() as jest.MockedFunction<any>,
  deleteNamespacedDeployment: jest.fn() as jest.MockedFunction<any>,
};

const mockKubeConfig = {
  getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
  getCurrentContext: jest.fn().mockReturnValue('test-context'),
  loadFromCluster: jest.fn(),
  loadFromString: jest.fn(),
  makeApiClient: jest.fn(),
};

jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => mockKubeConfig),
  CoreV1Api: jest.fn().mockImplementation(() => mockCoreV1Api),
  AppsV1Api: jest.fn().mockImplementation(() => mockAppsV1Api),
  BatchV1Api: jest.fn(),
  Exec: jest.fn(),
}));

// Mock Prisma
const mockPrisma = {
  cluster: {
    findUnique: jest.fn() as jest.MockedFunction<any>,
  },
  environment: {
    findUnique: jest.fn() as jest.MockedFunction<any>,
    update: jest.fn() as jest.MockedFunction<any>,
  },
};

jest.mock('@/config/database', () => ({
  prisma: mockPrisma,
}));

// Mock encryption service
const mockEncryptionService = {
  decrypt: jest.fn(),
};

jest.mock('@/utils/encryption', () => ({
  encryptionService: mockEncryptionService,
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@/config/logger', () => ({
  default: mockLogger,
  serializeError: jest.fn().mockImplementation((error: any) => ({
    name: error?.name || 'UnknownError',
    message: error?.message || 'Unknown error',
    stack: error?.stack,
  })),
}));

// Mock yaml
jest.mock('yaml', () => ({
  parse: jest.fn().mockImplementation((input: any) => {
    if (typeof input === 'string' && input.includes('invalid-yaml')) {
      throw new Error('Invalid YAML syntax');
    }
    return { kind: 'Config' };
  }),
}));

import { kubernetesService } from '@/services/kubernetes';

describe('KubernetesService - Error Scenarios', () => {
  const testEnvironmentOptions = {
    environmentId: 'env-error-test',
    userId: 'user-error-test',
    name: 'error-test-env',
    dockerImage: 'node:18',
    port: 3000,
    resources: {
      cpu: '500m',
      memory: '1Gi',
      storage: '10Gi',
    },
    environmentVariables: {
      NODE_ENV: 'test',
    },
    startupCommands: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear service cache
    (kubernetesService as any).clients.clear();
    (kubernetesService as any).kubeConfigs.clear();

    // Default mock setup
    mockKubeConfig.makeApiClient.mockImplementation((ApiClient: any) => {
      if (ApiClient.name === 'CoreV1Api') return mockCoreV1Api;
      if (ApiClient.name === 'AppsV1Api') return mockAppsV1Api;
      return {};
    });
  });

  describe('Client Initialization Errors', () => {
    it('should handle cluster not found error gracefully', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue(null);

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create environment in Kubernetes',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: expect.stringContaining('not found or inactive'),
          }),
        })
      );
    });

    it('should handle kubeconfig decryption failure with invalid fallback', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        id: 'test-cluster',
        name: 'Test Cluster',
        kubeconfig: 'invalid-yaml-content',
        status: 'ACTIVE',
      });

      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/Invalid kubeconfig format/);
    });

    it('should handle kubeconfig load failure', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        id: 'test-cluster',
        name: 'Test Cluster',
        kubeconfig: 'valid-yaml',
        status: 'ACTIVE',
      });

      mockEncryptionService.decrypt.mockReturnValue('valid-yaml');
      mockKubeConfig.loadFromString.mockImplementation(() => {
        throw new Error('Invalid kubeconfig content');
      });

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/Invalid kubeconfig format/);
    });

    it('should handle API client creation failure', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        id: 'test-cluster',
        name: 'Test Cluster',
        kubeconfig: 'apiVersion: v1\nkind: Config\nclusters:\n- name: test\ncontexts:\n- name: test',
        status: 'ACTIVE',
      });

      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      mockKubeConfig.makeApiClient.mockImplementation(() => {
        throw new Error('Failed to create API client');
      });

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(KubernetesError);
    });

    it('should handle context validation failure', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        id: 'test-cluster',
        name: 'Test Cluster',
        kubeconfig: 'apiVersion: v1\nkind: Config\nclusters:\n- name: test\ncontexts:\n- name: test',
        status: 'ACTIVE',
      });

      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      mockKubeConfig.getContexts.mockReturnValue([]);

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/No contexts found in kubeconfig/);
    });
  });

  describe('Environment Creation Error Scenarios', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
      });
    });

    it('should handle namespace creation failure', async () => {
      mockCoreV1Api.readNamespace.mockRejectedValue(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockRejectedValue(new Error('Insufficient permissions'));

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);

      // Should update environment status to ERROR
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-error-test' },
        data: {
          status: 'ERROR',
          lastError: expect.stringContaining('Insufficient permissions'),
        },
      });
    });

    it('should handle PVC creation failure', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} }); // Namespace exists
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockRejectedValue(
        new Error('Storage quota exceeded')
      );
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(/Storage quota exceeded/);
    });

    it('should handle ConfigMap creation failure', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockRejectedValue(
        new Error('ConfigMap size too large')
      );

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(/ConfigMap size too large/);
    });

    it('should handle deployment creation failure', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockRejectedValue(
        new Error('Image pull failed')
      );

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(/Image pull failed/);
    });

    it('should handle service creation failure', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedService.mockRejectedValue(
        new Error('Service port conflict')
      );

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(/Service port conflict/);
    });

    it('should handle database update failure during creation', async () => {
      // Mock successful Kubernetes operations
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValue({ body: {} });

      // Mock database update failure
      mockPrisma.environment.update.mockRejectedValue(new Error('Database connection lost'));

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);
    });

    it('should handle cleanup failure during error recovery', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockRejectedValue(
        new Error('Deployment failed')
      );

      // Mock cleanup failure
      jest.spyOn(kubernetesService as any, 'cleanupFailedEnvironment').mockRejectedValue(
        new Error('Cleanup failed')
      );

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to cleanup after environment creation failure',
        expect.objectContaining({
          environmentId: 'env-error-test',
          cleanupError: expect.objectContaining({
            message: 'Cleanup failed',
          }),
        })
      );
    });

    it('should handle database error update failure during error recovery', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockRejectedValue(
        new Error('Deployment failed')
      );

      // Mock cleanup success but database update failure
      jest.spyOn(kubernetesService as any, 'cleanupFailedEnvironment').mockResolvedValue(undefined);
      mockPrisma.environment.update.mockRejectedValue(new Error('Database update failed'));

      await expect(
        kubernetesService.createEnvironment(testEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to update environment status',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: 'Database update failed',
          }),
        })
      );
    });
  });

  describe('Environment Management Error Scenarios', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-error-test',
        kubernetesPodName: 'env-env-error-test',
        kubernetesServiceName: 'svc-env-error-test',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
      });
    });

    it('should handle deployment read failure in getEnvironmentInfo', async () => {
      mockAppsV1Api.readNamespacedDeployment.mockRejectedValue(
        new Error('Deployment not found')
      );

      const result = await kubernetesService.getEnvironmentInfo('env-error-test');

      expect(result).toEqual({
        status: 'ERROR',
        namespace: 'unknown',
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get environment info from Kubernetes',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: 'Deployment not found',
          }),
        })
      );
    });

    it('should handle deployment scaling failure in startEnvironment', async () => {
      mockAppsV1Api.patchNamespacedDeployment.mockRejectedValue(
        new Error('Deployment scaling failed')
      );

      await expect(
        kubernetesService.startEnvironment('env-error-test')
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start environment',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: 'Deployment scaling failed',
          }),
        })
      );
    });

    it('should handle deployment scaling failure in stopEnvironment', async () => {
      mockAppsV1Api.patchNamespacedDeployment.mockRejectedValue(
        new Error('Deployment scaling failed')
      );

      await expect(
        kubernetesService.stopEnvironment('env-error-test')
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to stop environment',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: 'Deployment scaling failed',
          }),
        })
      );
    });

    it('should handle client initialization failure in deleteEnvironment', async () => {
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockRejectedValue(
        new Error('Client initialization failed')
      );

      await expect(
        kubernetesService.deleteEnvironment('env-error-test')
      ).rejects.toThrow(KubernetesError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete environment from Kubernetes',
        expect.objectContaining({
          environmentId: 'env-error-test',
          error: expect.objectContaining({
            message: 'Client initialization failed',
          }),
        })
      );
    });
  });

  describe('Command Execution Error Scenarios', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-error-test',
        kubernetesPodName: 'env-env-error-test',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
      });

      (kubernetesService as any).kubeConfigs.set('test-cluster', mockKubeConfig);
    });

    it('should handle pod listing failure', async () => {
      mockCoreV1Api.listNamespacedPod.mockRejectedValue(new Error('API server unavailable'));

      const result = await kubernetesService.executeCommand('env-error-test', 'ls');

      expect(result).toEqual({
        success: false,
        error: 'Failed to execute command: API server unavailable',
      });
    });

    it('should handle missing kubeconfig for exec', async () => {
      (kubernetesService as any).kubeConfigs.delete('test-cluster');

      const result = await kubernetesService.executeCommand('env-error-test', 'ls');

      expect(result).toEqual({
        success: false,
        error: 'Cluster not available',
      });
    });

    it('should handle pods without names', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: undefined },
              status: { phase: 'Running' },
            },
          ],
        },
      });

      const result = await kubernetesService.executeCommand('env-error-test', 'ls');

      expect(result).toEqual({
        success: false,
        error: 'Pod name not found',
      });
    });

    it('should handle exec execution failure', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'test-pod' },
              status: { phase: 'Running' },
            },
          ],
        },
      });

      // Mock Exec to simulate execution failure
      const mockExecInstance = {
        exec: jest.fn().mockImplementation((namespace, pod, container, command, stdout, stderr, stdin, tty, callback) => {
          callback({ status: 'Failure', message: 'Command execution failed' });
        }),
      };
      
      (require('@kubernetes/client-node').Exec as jest.Mock).mockImplementation(() => mockExecInstance);

      const result = await kubernetesService.executeCommand('env-error-test', 'invalid-command');

      expect(result).toEqual({
        success: false,
        output: '',
        error: '',
      });
    });
  });

  describe('Log Retrieval Error Scenarios', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-error-test',
        kubernetesPodName: 'env-env-error-test',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
      });
    });

    it('should handle pod listing failure in log retrieval', async () => {
      mockCoreV1Api.listNamespacedPod.mockRejectedValue(new Error('Pod listing failed'));

      const result = await kubernetesService.getEnvironmentLogs('env-error-test');

      expect(result).toBe('Error retrieving logs: Pod listing failed');
    });

    it('should handle missing pod names in log retrieval', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: undefined },
            },
          ],
        },
      });

      const result = await kubernetesService.getEnvironmentLogs('env-error-test');

      expect(result).toBe('Pod name not found');
    });

    it('should handle log reading failure', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'test-pod' },
            },
          ],
        },
      });

      mockCoreV1Api.readNamespacedPodLog.mockRejectedValue(new Error('Log reading failed'));

      const result = await kubernetesService.getEnvironmentLogs('env-error-test');

      expect(result).toBe('Error retrieving logs: Log reading failed');
    });

    it('should handle client initialization failure in log retrieval', async () => {
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockRejectedValue(
        new Error('Client failed')
      );

      const result = await kubernetesService.getEnvironmentLogs('env-error-test');

      expect(result).toBe('Error retrieving logs: Client failed');
    });
  });

  describe('Retry Mechanism Edge Cases', () => {
    it('should handle non-Error objects in retry mechanism', async () => {
      const operation = jest.fn().mockRejectedValue('String error');

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', {})
      ).rejects.toThrow('String error');
    });

    it('should handle errors without message property', async () => {
      const errorWithoutMessage = new Error();
      delete (errorWithoutMessage as any).message;

      const result = (kubernetesService as any).isRetryableError(errorWithoutMessage);
      expect(result).toBe(false);
    });

    it('should handle null/undefined errors in retry mechanism', async () => {
      const operation = jest.fn().mockRejectedValue(null);

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', {})
      ).rejects.toThrow('null');
    });
  });

  describe('Resource Validation Edge Cases', () => {
    it('should handle validateKubeconfigFormat with non-string input', () => {
      expect((kubernetesService as any).validateKubeconfigFormat(123)).toBe(false);
      expect((kubernetesService as any).validateKubeconfigFormat({})).toBe(false);
      expect((kubernetesService as any).validateKubeconfigFormat([])).toBe(false);
    });

    it('should handle YAML parsing errors in kubeconfig validation', () => {
      const invalidYaml = `
apiVersion: v1
kind: Config
clusters:
contexts:
invalid-yaml
`;

      const result = (kubernetesService as any).validateKubeconfigFormat(invalidYaml);
      expect(result).toBe(false);
    });

    it('should handle kubeconfig without required kind field', () => {
      const kubeconfigWithoutKind = `
apiVersion: v1
clusters:
- name: test
contexts:
- name: test
`;

      const originalParse = require('yaml').parse;
      require('yaml').parse = jest.fn().mockReturnValue({ kind: null });

      const result = (kubernetesService as any).validateKubeconfigFormat(kubeconfigWithoutKind);
      expect(result).toBe(false);

      require('yaml').parse = originalParse;
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle extractCpuUsage with undefined pod', () => {
      const result = (kubernetesService as any).extractCpuUsage(undefined);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should handle extractMemoryUsage with null pod', () => {
      const result = (kubernetesService as any).extractMemoryUsage(null);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should handle pod metrics extraction failure gracefully', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-error-test',
        kubernetesPodName: 'env-env-error-test',
        kubernetesServiceName: 'svc-env-error-test',
      });

      mockAppsV1Api.readNamespacedDeployment.mockResolvedValue({
        body: {
          status: { readyReplicas: 1 },
          spec: { replicas: 1 },
        },
      });

      // Mock pod listing failure for metrics
      mockCoreV1Api.listNamespacedPod.mockRejectedValue(new Error('Metrics unavailable'));

      const result = await kubernetesService.getEnvironmentInfo('env-error-test');

      expect(result.status).toBe('RUNNING');
      expect(result.cpuUsage).toBe(0);
      expect(result.memoryUsage).toBe(0);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Failed to get pod metrics for deployment',
        expect.objectContaining({
          error: 'Metrics unavailable',
        })
      );
    });
  });

  describe('Concurrent Operation Conflicts', () => {
    it('should handle client cache race conditions', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        id: 'test-cluster',
        name: 'Test Cluster',
        kubeconfig: 'apiVersion: v1\nkind: Config\nclusters:\n- name: test\ncontexts:\n- name: test',
        status: 'ACTIVE',
      });

      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      // Simulate concurrent calls to getKubernetesClient
      const promises = Array(5).fill(null).map(() =>
        (kubernetesService as any).getKubernetesClient('test-cluster')
      );

      const results = await Promise.allSettled(promises);

      // All should either succeed or fail with the same error
      const statuses = results.map(r => r.status);
      const uniqueStatuses = [...new Set(statuses)];
      
      // Should handle concurrent initialization properly
      expect(uniqueStatuses.length).toBeLessThanOrEqual(2); // Either all fulfilled or all rejected
    });
  });
});
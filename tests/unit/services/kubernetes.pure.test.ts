import { jest } from '@jest/globals';
import * as fs from 'fs';
import { KubernetesError } from '@/types/errors';

// Mock fs before importing the service
jest.mock('fs');

// Mock the Kubernetes client-node library
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

const mockBatchV1Api = {
  createNamespacedJob: jest.fn() as jest.MockedFunction<any>,
};

const mockKubeConfig = {
  getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
  getCurrentContext: jest.fn().mockReturnValue('test-context'),
  loadFromCluster: jest.fn(),
  loadFromString: jest.fn(),
  makeApiClient: jest.fn(),
};

const mockExec = jest.fn();

jest.mock('@kubernetes/client-node', () => ({
  KubeConfig: jest.fn().mockImplementation(() => mockKubeConfig),
  CoreV1Api: jest.fn().mockImplementation(() => mockCoreV1Api),
  AppsV1Api: jest.fn().mockImplementation(() => mockAppsV1Api),
  BatchV1Api: jest.fn().mockImplementation(() => mockBatchV1Api),
  Exec: jest.fn().mockImplementation(() => mockExec),
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
    if (typeof input === 'string' && input.includes('apiVersion: v1') && input.includes('kind: Config')) {
      return { kind: 'Config' };
    }
    throw new Error('Invalid YAML');
  }),
}));

import { kubernetesService } from '@/services/kubernetes';

describe('KubernetesService - Comprehensive Unit Tests', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset clients cache
    (kubernetesService as any).clients.clear();
    (kubernetesService as any).kubeConfigs.clear();

    // Default mock implementations
    mockKubeConfig.makeApiClient.mockImplementation((ApiClient: any) => {
      if (ApiClient.name === 'CoreV1Api') return mockCoreV1Api;
      if (ApiClient.name === 'AppsV1Api') return mockAppsV1Api;
      if (ApiClient.name === 'BatchV1Api') return mockBatchV1Api;
      return {};
    });
  });

  describe('isRunningInCluster', () => {
    it('should return true when all service account files exist', () => {
      mockFs.existsSync.mockReturnValue(true);

      const result = (kubernetesService as any).isRunningInCluster();

      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/token');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/namespace');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
    });

    it('should return false when service account files do not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = (kubernetesService as any).isRunningInCluster();

      expect(result).toBe(false);
    });

    it('should return false when fs operations throw error', () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = (kubernetesService as any).isRunningInCluster();

      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Error checking in-cluster environment',
        expect.objectContaining({ error: 'File system error' })
      );
    });
  });

  describe('getKubernetesClient', () => {
    const mockCluster = {
      id: 'test-cluster',
      name: 'Test Cluster',
      kubeconfig: 'encrypted-kubeconfig',
      status: 'ACTIVE',
    };

    const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: test-cluster
contexts:
- name: test-context
users:
- name: test-user
current-context: test-context
`;

    beforeEach(() => {
      mockPrisma.cluster.findUnique.mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue(validKubeconfig);
      mockFs.existsSync.mockReturnValue(false); // Not in cluster by default
    });

    it('should use in-cluster configuration when running in cluster', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockKubeConfig.loadFromCluster.mockResolvedValue(undefined);

      const client = await (kubernetesService as any).getKubernetesClient('test-cluster');

      expect(client).toHaveProperty('coreV1Api');
      expect(client).toHaveProperty('appsV1Api');
      expect(client).toHaveProperty('batchV1Api');
      expect(mockKubeConfig.loadFromCluster).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully loaded in-cluster Kubernetes configuration',
        { clusterId: 'test-cluster' }
      );
    });

    it('should fall back to external kubeconfig when in-cluster fails', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockKubeConfig.loadFromCluster.mockRejectedValue(new Error('In-cluster failed'));

      const client = await (kubernetesService as any).getKubernetesClient('test-cluster');

      expect(client).toHaveProperty('coreV1Api');
      expect(mockKubeConfig.loadFromString).toHaveBeenCalledWith(validKubeconfig);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load in-cluster config, falling back to external kubeconfig',
        expect.objectContaining({ clusterId: 'test-cluster' })
      );
    });

    it('should use external kubeconfig when not running in cluster', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const client = await (kubernetesService as any).getKubernetesClient('test-cluster');

      expect(client).toHaveProperty('coreV1Api');
      expect(mockKubeConfig.loadFromString).toHaveBeenCalledWith(validKubeconfig);
      expect(mockPrisma.cluster.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-cluster' },
        select: {
          id: true,
          name: true,
          kubeconfig: true,
          status: true,
        },
      });
    });

    it('should return cached client for same cluster', async () => {
      // First call
      await (kubernetesService as any).getKubernetesClient('test-cluster');
      
      // Second call should use cache
      const client = await (kubernetesService as any).getKubernetesClient('test-cluster');

      expect(client).toHaveProperty('coreV1Api');
      expect(mockPrisma.cluster.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should throw error when cluster not found', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue(null);

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(KubernetesError);
    });

    it('should throw error when cluster is inactive', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        status: 'INACTIVE',
      });

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/not found or inactive/);
    });

    it('should fall back to plain text when decryption fails', async () => {
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        kubeconfig: validKubeconfig, // Plain text
      });

      const client = await (kubernetesService as any).getKubernetesClient('test-cluster');

      expect(client).toHaveProperty('coreV1Api');
      expect(mockKubeConfig.loadFromString).toHaveBeenCalledWith(validKubeconfig);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to decrypt kubeconfig, assuming plain text',
        expect.objectContaining({ clusterId: 'test-cluster' })
      );
    });

    it('should throw error for invalid kubeconfig format', async () => {
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        kubeconfig: 'invalid-yaml',
      });

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/Invalid kubeconfig format/);
    });

    it('should throw error when no contexts available', async () => {
      mockKubeConfig.getContexts.mockReturnValue([]);

      await expect(
        (kubernetesService as any).getKubernetesClient('test-cluster')
      ).rejects.toThrow(/No contexts found in kubeconfig/);
    });
  });

  describe('createEnvironment', () => {
    const mockEnvironmentOptions = {
      environmentId: 'env-123',
      userId: 'user-123',
      name: 'test-env',
      dockerImage: 'node:18',
      port: 3000,
      resources: {
        cpu: '500m',
        memory: '1Gi',
        storage: '10Gi',
      },
      environmentVariables: {
        NODE_ENV: 'development',
      },
      startupCommands: ['npm install', 'npm start'],
    };

    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
      });
      mockPrisma.environment.update.mockResolvedValue({});
      
      // Mock successful Kubernetes operations
      mockCoreV1Api.readNamespace.mockRejectedValue(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValue({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValue({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValue({ body: {} });
      
      // Set up client mocks
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should create environment successfully with all resources', async () => {
      const result = await kubernetesService.createEnvironment(mockEnvironmentOptions);

      expect(result).toEqual({
        status: 'PROVISIONING',
        deploymentName: 'env-env-123',
        serviceName: 'svc-env-123',
        namespace: 'devpocket-user-123',
        internalUrl: 'http://svc-env-123.devpocket-user-123.svc.cluster.local:3000',
      });

      // Verify namespace creation
      expect(mockCoreV1Api.createNamespace).toHaveBeenCalledWith({
        metadata: {
          name: 'devpocket-user-123',
          labels: {
            'app.kubernetes.io/name': 'devpocket',
            'app.kubernetes.io/part-of': 'devpocket-environments',
          },
        },
      });

      // Verify PVC creation
      expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        'devpocket-user-123',
        expect.objectContaining({
          metadata: {
            name: 'pvc-env-123',
            namespace: 'devpocket-user-123',
            labels: expect.objectContaining({
              'app.kubernetes.io/name': 'devpocket',
              'app.kubernetes.io/component': 'storage',
            }),
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: '10Gi',
              },
            },
          },
        })
      );

      // Verify ConfigMap creation
      expect(mockCoreV1Api.createNamespacedConfigMap).toHaveBeenCalledWith(
        'devpocket-user-123',
        expect.objectContaining({
          metadata: {
            name: 'config-env-123',
            namespace: 'devpocket-user-123',
            labels: expect.objectContaining({
              'app.kubernetes.io/name': 'devpocket',
              'app.kubernetes.io/component': 'config',
            }),
          },
          data: {
            'startup.sh': expect.stringContaining('npm install'),
          },
        })
      );

      // Verify Deployment creation
      expect(mockAppsV1Api.createNamespacedDeployment).toHaveBeenCalledWith(
        'devpocket-user-123',
        expect.objectContaining({
          metadata: {
            name: 'env-env-123',
            namespace: 'devpocket-user-123',
          },
          spec: expect.objectContaining({
            replicas: 1,
            template: expect.objectContaining({
              spec: expect.objectContaining({
                containers: expect.arrayContaining([
                  expect.objectContaining({
                    name: 'devpocket',
                    image: 'node:18',
                    env: expect.arrayContaining([
                      { name: 'NODE_ENV', value: 'development' },
                    ]),
                  }),
                ]),
              }),
            }),
          }),
        )
      );

      // Verify Service creation
      expect(mockCoreV1Api.createNamespacedService).toHaveBeenCalledWith(
        'devpocket-user-123',
        expect.objectContaining({
          metadata: {
            name: 'svc-env-123',
            namespace: 'devpocket-user-123',
          },
          spec: {
            selector: {
              app: 'env-env-123',
            },
            ports: expect.arrayContaining([
              { port: 3000, targetPort: 3000, name: 'app-port' },
              { port: 22, targetPort: 22, name: 'ssh' },
            ]),
            type: 'ClusterIP',
          },
        })
      );

      // Verify database update
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: {
          status: 'PROVISIONING',
          kubernetesNamespace: 'devpocket-user-123',
          kubernetesPodName: 'env-env-123',
          kubernetesServiceName: 'svc-env-123',
          externalUrl: 'http://svc-env-123.devpocket-user-123.svc.cluster.local:3000',
        },
      });
    });

    it('should handle namespace already exists gracefully', async () => {
      mockCoreV1Api.readNamespace.mockResolvedValue({ body: {} });

      await kubernetesService.createEnvironment(mockEnvironmentOptions);

      expect(mockCoreV1Api.readNamespace).toHaveBeenCalledWith('devpocket-user-123');
      expect(mockCoreV1Api.createNamespace).not.toHaveBeenCalled();
    });

    it('should handle environment not found error', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue(null);

      await expect(
        kubernetesService.createEnvironment(mockEnvironmentOptions)
      ).rejects.toThrow(/Environment not found/);
    });

    it('should cleanup resources and update status on failure', async () => {
      // Mock partial success - namespace and PVC created, but deployment fails
      mockAppsV1Api.createNamespacedDeployment.mockRejectedValue(new Error('Deployment failed'));
      
      // Mock cleanup operations
      jest.spyOn(kubernetesService as any, 'cleanupFailedEnvironment').mockResolvedValue(undefined);

      await expect(
        kubernetesService.createEnvironment(mockEnvironmentOptions)
      ).rejects.toThrow(KubernetesError);

      // Verify cleanup was called
      expect((kubernetesService as any).cleanupFailedEnvironment).toHaveBeenCalledWith(
        'env-123',
        'user-123'
      );

      // Verify status updated to ERROR
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: {
          status: 'ERROR',
          lastError: expect.stringContaining('Deployment failed'),
        },
      });
    });
  });

  describe('getEnvironmentInfo', () => {
    beforeEach(() => {
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should return environment info for running deployment', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
        kubernetesServiceName: 'svc-env-123',
      });

      mockAppsV1Api.readNamespacedDeployment.mockResolvedValue({
        body: {
          status: {
            readyReplicas: 1,
          },
          spec: {
            replicas: 1,
          },
        },
      });

      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'pod-123' },
              status: { phase: 'Running' },
            },
          ],
        },
      });

      const result = await kubernetesService.getEnvironmentInfo('env-123');

      expect(result).toEqual({
        status: 'RUNNING',
        deploymentName: 'env-env-123',
        serviceName: 'svc-env-123',
        namespace: 'devpocket-user-123',
        cpuUsage: expect.any(Number),
        memoryUsage: expect.any(Number),
      });
    });

    it('should return STOPPED status for scaled down deployment', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
        kubernetesServiceName: 'svc-env-123',
      });

      mockAppsV1Api.readNamespacedDeployment.mockResolvedValue({
        body: {
          status: {
            readyReplicas: 0,
          },
          spec: {
            replicas: 1,
          },
        },
      });

      const result = await kubernetesService.getEnvironmentInfo('env-123');

      expect(result.status).toBe('STOPPED');
    });

    it('should return PROVISIONING status for progressing deployment', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
        kubernetesServiceName: 'svc-env-123',
      });

      mockAppsV1Api.readNamespacedDeployment.mockResolvedValue({
        body: {
          status: {
            readyReplicas: 0,
            conditions: [
              { type: 'Progressing', status: 'True' },
            ],
          },
          spec: {
            replicas: 1,
          },
        },
      });

      const result = await kubernetesService.getEnvironmentInfo('env-123');

      expect(result.status).toBe('PROVISIONING');
    });

    it('should return NOT_DEPLOYED when environment not in Kubernetes', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
        kubernetesServiceName: null,
      });

      const result = await kubernetesService.getEnvironmentInfo('env-123');

      expect(result).toEqual({
        status: 'NOT_DEPLOYED',
        namespace: 'unknown',
      });
    });

    it('should return ERROR status on Kubernetes API failure', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
        kubernetesServiceName: 'svc-env-123',
      });

      (kubernetesService as any).getKubernetesClient.mockRejectedValue(
        new Error('Kubernetes API error')
      );

      const result = await kubernetesService.getEnvironmentInfo('env-123');

      expect(result).toEqual({
        status: 'ERROR',
        namespace: 'unknown',
      });
    });
  });

  describe('startEnvironment', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
      });
      mockPrisma.environment.update.mockResolvedValue({});
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should scale up deployment to start environment', async () => {
      mockAppsV1Api.patchNamespacedDeployment.mockResolvedValue({ body: {} });

      await kubernetesService.startEnvironment('env-123');

      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalledWith(
        'env-env-123',
        'devpocket-user-123',
        [{ op: 'replace', path: '/spec/replicas', value: 1 }],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: { status: 'RUNNING' },
      });
    });

    it('should throw error when environment not deployed', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
      });

      await expect(kubernetesService.startEnvironment('env-123')).rejects.toThrow(
        /Environment not deployed to Kubernetes/
      );
    });

    it('should handle Kubernetes API failures', async () => {
      mockAppsV1Api.patchNamespacedDeployment.mockRejectedValue(
        new Error('API Server unavailable')
      );

      await expect(kubernetesService.startEnvironment('env-123')).rejects.toThrow(
        KubernetesError
      );
    });
  });

  describe('stopEnvironment', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
      });
      mockPrisma.environment.update.mockResolvedValue({});
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should scale down deployment to stop environment', async () => {
      mockAppsV1Api.patchNamespacedDeployment.mockResolvedValue({ body: {} });

      await kubernetesService.stopEnvironment('env-123');

      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalledWith(
        'env-env-123',
        'devpocket-user-123',
        [{ op: 'replace', path: '/spec/replicas', value: 0 }],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: { status: 'STOPPING' },
      });
    });

    it('should throw error when environment not deployed', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
      });

      await expect(kubernetesService.stopEnvironment('env-123')).rejects.toThrow(
        /Environment not deployed to Kubernetes/
      );
    });
  });

  describe('deleteEnvironment', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
        kubernetesServiceName: 'svc-env-123',
      });
      mockPrisma.environment.update.mockResolvedValue({});
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should delete all environment resources in parallel', async () => {
      mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValue({ body: {} });
      mockCoreV1Api.deleteNamespacedService.mockResolvedValue({ body: {} });
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValue({ body: {} });

      await kubernetesService.deleteEnvironment('env-123');

      // Verify all resources are deleted
      expect(mockAppsV1Api.deleteNamespacedDeployment).toHaveBeenCalledWith(
        'env-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedService).toHaveBeenCalledWith(
        'svc-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        'pvc-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedConfigMap).toHaveBeenCalledWith(
        'config-env-123',
        'devpocket-user-123'
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: { status: 'TERMINATED' },
      });
    });

    it('should handle partial deletion failures gracefully', async () => {
      mockAppsV1Api.deleteNamespacedDeployment.mockRejectedValue(new Error('Deployment not found'));
      mockCoreV1Api.deleteNamespacedService.mockRejectedValue(new Error('Service not found'));
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValue({ body: {} });

      await kubernetesService.deleteEnvironment('env-123');

      // Should still update environment status despite partial failures
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: { status: 'TERMINATED' },
      });

      // Should log warnings for failed deletions
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete deployment',
        expect.objectContaining({ deployment: 'env-env-123' })
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to delete service',
        expect.objectContaining({ service: 'svc-env-123' })
      );
    });

    it('should return early when environment not deployed', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
        kubernetesServiceName: null,
      });

      await kubernetesService.deleteEnvironment('env-123');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Environment not deployed to Kubernetes',
        { environmentId: 'env-123' }
      );
      expect(mockAppsV1Api.deleteNamespacedDeployment).not.toHaveBeenCalled();
    });
  });

  describe('executeCommand', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });

      (kubernetesService as any).kubeConfigs.set('test-cluster', mockKubeConfig);
    });

    it('should execute command in running pod', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'pod-123' },
              status: { phase: 'Running' },
            },
          ],
        },
      });

      // Mock the exec constructor and exec method
      const mockExecInstance = {
        exec: jest.fn().mockImplementation((namespace, pod, container, command, stdout, stderr, stdin, tty, callback) => {
          // Simulate successful execution
          callback({ status: 'Success' });
        }),
      };
      
      (require('@kubernetes/client-node').Exec as jest.Mock).mockImplementation(() => mockExecInstance);

      const result = await kubernetesService.executeCommand('env-123', 'ls -la');

      expect(result).toEqual({
        success: true,
        output: '',
        error: '',
      });

      expect(mockExecInstance.exec).toHaveBeenCalledWith(
        'devpocket-user-123',
        'pod-123',
        'devpocket',
        ['/bin/bash', '-c', 'ls -la'],
        expect.any(Object),
        expect.any(Object),
        null,
        true,
        expect.any(Function)
      );
    });

    it('should return error when no running pods found', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [],
        },
      });

      const result = await kubernetesService.executeCommand('env-123', 'ls -la');

      expect(result).toEqual({
        success: false,
        error: 'No running pods found for environment',
      });
    });

    it('should return error when environment not deployed', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
      });

      const result = await kubernetesService.executeCommand('env-123', 'ls -la');

      expect(result).toEqual({
        success: false,
        error: 'Environment not deployed',
      });
    });
  });

  describe('getEnvironmentLogs', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: 'devpocket-user-123',
        kubernetesPodName: 'env-env-123',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should retrieve logs from pod', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'pod-123' },
            },
          ],
        },
      });

      mockCoreV1Api.readNamespacedPodLog.mockResolvedValue({
        body: 'Application started successfully\nListening on port 3000',
      });

      const logs = await kubernetesService.getEnvironmentLogs('env-123', 50, false);

      expect(logs).toBe('Application started successfully\nListening on port 3000');
      
      expect(mockCoreV1Api.readNamespacedPodLog).toHaveBeenCalledWith(
        'pod-123',
        'devpocket-user-123',
        'devpocket',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        50,
        undefined
      );
    });

    it('should return message when no pods found', async () => {
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [],
        },
      });

      const logs = await kubernetesService.getEnvironmentLogs('env-123');

      expect(logs).toBe('No pods found for environment');
    });

    it('should return message when environment not deployed', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
        kubernetesNamespace: null,
        kubernetesPodName: null,
      });

      const logs = await kubernetesService.getEnvironmentLogs('env-123');

      expect(logs).toBe('Environment not deployed to Kubernetes');
    });

    it('should return error message on API failure', async () => {
      mockCoreV1Api.listNamespacedPod.mockRejectedValue(new Error('API error'));

      const logs = await kubernetesService.getEnvironmentLogs('env-123');

      expect(logs).toBe('Error retrieving logs: API error');
    });
  });

  describe('retryOperation', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await (kubernetesService as any).retryOperation(
        operation,
        'Test operation',
        { context: 'test' }
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable errors and eventually succeed', async () => {
      const retryableError = new Error('connection timeout');
      const operation = jest.fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');

      const result = await (kubernetesService as any).retryOperation(
        operation,
        'Test operation',
        { context: 'test' }
      );

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('authentication failed');
      const operation = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', { context: 'test' })
      ).rejects.toThrow('authentication failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries with retryable error', async () => {
      const retryableError = new Error('service unavailable');
      const operation = jest.fn().mockRejectedValue(retryableError);

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', { context: 'test' })
      ).rejects.toThrow('service unavailable');

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('isRetryableError', () => {
    const testCases = [
      { error: 'Connection refused', expected: true },
      { error: 'connection timeout', expected: true },
      { error: 'Connection reset by peer', expected: true },
      { error: 'Request timeout', expected: true },
      { error: 'temporarily unavailable', expected: true },
      { error: 'Service Unavailable', expected: true },
      { error: 'Too Many Requests', expected: true },
      { error: 'etcd cluster is unavailable', expected: true },
      { error: 'Authentication failed', expected: false },
      { error: 'Permission denied', expected: false },
      { error: 'Invalid request', expected: false },
    ];

    testCases.forEach(({ error, expected }) => {
      it(`should return ${expected} for error: ${error}`, () => {
        const result = (kubernetesService as any).isRetryableError(new Error(error));
        expect(result).toBe(expected);
      });
    });
  });

  describe('validateKubeconfigFormat', () => {
    it('should validate correct kubeconfig format', () => {
      const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: test
contexts:
- name: test
`;

      const result = (kubernetesService as any).validateKubeconfigFormat(validKubeconfig);
      expect(result).toBe(true);
    });

    it('should reject invalid kubeconfig format', () => {
      const invalidKubeconfig = 'not-a-valid-kubeconfig';

      const result = (kubernetesService as any).validateKubeconfigFormat(invalidKubeconfig);
      expect(result).toBe(false);
    });

    it('should reject empty kubeconfig', () => {
      const result = (kubernetesService as any).validateKubeconfigFormat('');
      expect(result).toBe(false);
    });

    it('should reject null or undefined kubeconfig', () => {
      expect((kubernetesService as any).validateKubeconfigFormat(null)).toBe(false);
      expect((kubernetesService as any).validateKubeconfigFormat(undefined)).toBe(false);
    });
  });

  describe('cleanupFailedEnvironment', () => {
    beforeEach(() => {
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: 'test-cluster',
      });
      
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue({
        coreV1Api: mockCoreV1Api,
        appsV1Api: mockAppsV1Api,
        batchV1Api: mockBatchV1Api,
      });
    });

    it('should cleanup all created resources', async () => {
      mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValue({});
      mockCoreV1Api.deleteNamespacedService.mockResolvedValue({});
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValue({});
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValue({});

      await (kubernetesService as any).cleanupFailedEnvironment('env-123', 'user-123');

      expect(mockAppsV1Api.deleteNamespacedDeployment).toHaveBeenCalledWith(
        'env-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedService).toHaveBeenCalledWith(
        'svc-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        'pvc-env-123',
        'devpocket-user-123'
      );
      expect(mockCoreV1Api.deleteNamespacedConfigMap).toHaveBeenCalledWith(
        'config-env-123',
        'devpocket-user-123'
      );
    });

    it('should handle cleanup failures gracefully', async () => {
      mockAppsV1Api.deleteNamespacedDeployment.mockRejectedValue(new Error('Deployment not found'));
      mockCoreV1Api.deleteNamespacedService.mockRejectedValue(new Error('Service not found'));

      // Should not throw
      await expect(
        (kubernetesService as any).cleanupFailedEnvironment('env-123', 'user-123')
      ).resolves.not.toThrow();
    });

    it('should handle missing environment gracefully', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue(null);

      await expect(
        (kubernetesService as any).cleanupFailedEnvironment('env-123', 'user-123')
      ).resolves.not.toThrow();

      expect(mockAppsV1Api.deleteNamespacedDeployment).not.toHaveBeenCalled();
    });
  });
});
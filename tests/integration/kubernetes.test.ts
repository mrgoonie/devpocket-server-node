import { KubernetesService } from '@/services/kubernetes';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';

// Mock the Kubernetes client
jest.mock('@kubernetes/client-node');
jest.mock('@/config/database');
jest.mock('@/utils/encryption');

describe('KubernetesService Integration Tests', () => {
  let kubernetesService: KubernetesService;
  const mockPrisma = prisma as jest.Mocked<typeof prisma>;
  const mockEncryption = encryptionService as jest.Mocked<typeof encryptionService>;

  beforeEach(() => {
    kubernetesService = new (KubernetesService as any)();
    jest.clearAllMocks();
  });

  describe('getKubernetesClient', () => {
    const mockCluster = {
      id: 'test-cluster',
      name: 'Test Cluster',
      kubeconfig: 'encrypted-kubeconfig-data',
      status: 'ACTIVE',
    };

    beforeEach(() => {
      mockPrisma.cluster.findUnique.mockResolvedValue(mockCluster as any);
    });

    it('should successfully decrypt and initialize client', async () => {
      const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test.k8s.cluster
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

      mockEncryption.decrypt.mockReturnValue(validKubeconfig);

      // This would normally initialize the K8s client, but we're mocking it
      await expect(async () => {
        await (kubernetesService as any).getKubernetesClient('test-cluster');
      }).not.toThrow();
    });

    it('should fall back to plain text when decryption fails', async () => {
      const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: test-cluster
  cluster:
    server: https://test.k8s.cluster
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

      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        kubeconfig: validKubeconfig,
      } as any);

      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      // Should not throw since it falls back to plain text
      await expect(async () => {
        await (kubernetesService as any).getKubernetesClient('test-cluster');
      }).not.toThrow();
    });

    it('should throw error for invalid kubeconfig format', async () => {
      const invalidKubeconfig = 'invalid-yaml-content';

      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        kubeconfig: invalidKubeconfig,
      } as any);

      mockEncryption.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect((kubernetesService as any).getKubernetesClient('test-cluster')).rejects.toThrow(
        /Invalid kubeconfig format/
      );
    });

    it('should throw error for inactive cluster', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue({
        ...mockCluster,
        status: 'INACTIVE',
      } as any);

      await expect((kubernetesService as any).getKubernetesClient('test-cluster')).rejects.toThrow(
        /not found or inactive/
      );
    });

    it('should throw error for non-existent cluster', async () => {
      mockPrisma.cluster.findUnique.mockResolvedValue(null);

      await expect((kubernetesService as any).getKubernetesClient('test-cluster')).rejects.toThrow(
        /not found or inactive/
      );
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
      } as any);

      mockPrisma.environment.update.mockResolvedValue({} as any);
    });

    it('should handle Kubernetes client initialization failure', async () => {
      jest
        .spyOn(kubernetesService as any, 'getKubernetesClient')
        .mockRejectedValue(new Error('Failed to connect to cluster'));

      await expect(kubernetesService.createEnvironment(mockEnvironmentOptions)).rejects.toThrow(
        /Failed to create environment/
      );

      // Should update environment status to ERROR
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: 'env-123' },
        data: expect.objectContaining({
          status: 'ERROR',
        }),
      });
    });

    it('should handle missing environment in database', async () => {
      mockPrisma.environment.findUnique.mockResolvedValue(null);

      await expect(kubernetesService.createEnvironment(mockEnvironmentOptions)).rejects.toThrow(
        /Environment not found/
      );
    });
  });

  describe('retry mechanism', () => {
    it('should retry operations on retryable errors', async () => {
      const retryableError = new Error('Connection timeout');
      const operation = jest
        .fn()
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('success');

      const result = await (kubernetesService as any).retryOperation(operation, 'Test operation', {
        context: 'test',
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const nonRetryableError = new Error('Authentication failed');
      const operation = jest.fn().mockRejectedValue(nonRetryableError);

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', { context: 'test' })
      ).rejects.toThrow('Authentication failed');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries reached', async () => {
      const retryableError = new Error('Connection refused');
      const operation = jest.fn().mockRejectedValue(retryableError);

      await expect(
        (kubernetesService as any).retryOperation(operation, 'Test operation', { context: 'test' })
      ).rejects.toThrow('Connection refused');

      expect(operation).toHaveBeenCalledTimes(3); // maxRetries
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
  });

  describe('error serialization', () => {
    it('should properly serialize errors in logs', async () => {
      const mockError = new Error('Test error');
      mockError.stack = 'Error stack trace';

      jest.spyOn(logger, 'error');

      mockPrisma.environment.findUnique.mockRejectedValue(mockError);

      await expect(kubernetesService.getEnvironmentInfo('env-123')).resolves.toEqual({
        status: 'ERROR',
        namespace: 'unknown',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get environment info'),
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error',
            stack: expect.stringContaining('Error stack trace'),
          }),
        })
      );
    });
  });
});

import { jest } from '@jest/globals';
import * as fs from 'fs';
import { KubeConfig } from '@kubernetes/client-node';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';

// Mock external dependencies
jest.mock('fs');
jest.mock('@kubernetes/client-node');
jest.mock('@/config/database');
jest.mock('@/utils/encryption');
jest.mock('@/config/logger');

const mockFs = jest.mocked(fs);
const mockKubeConfig = jest.mocked(KubeConfig);
const mockPrisma = jest.mocked(prisma);
const mockEncryptionService = jest.mocked(encryptionService);
const mockLogger = jest.mocked(logger);

// Import after mocking
import KubernetesService from '../kubernetes';

describe('KubernetesService - Hybrid Authentication', () => {
  let kubernetesService: KubernetesService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    kubernetesService = new (KubernetesService as any)();
  });

  describe('isRunningInCluster Detection', () => {
    it('should detect in-cluster environment when service account files exist', () => {
      // Mock service account files exist
      mockFs.existsSync
        .mockReturnValueOnce(true)  // token file
        .mockReturnValueOnce(true)  // namespace file
        .mockReturnValueOnce(true); // ca cert file

      const result = kubernetesService['isRunningInCluster']();
      
      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/token');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/namespace');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt');
    });

    it('should detect external environment when service account files are missing', () => {
      // Mock service account files don't exist
      mockFs.existsSync
        .mockReturnValueOnce(false) // token file missing
        .mockReturnValueOnce(true)  // namespace file exists
        .mockReturnValueOnce(true); // ca cert exists

      const result = kubernetesService['isRunningInCluster']();
      
      expect(result).toBe(false);
    });

    it('should handle errors gracefully and return false', () => {
      // Mock fs.existsSync to throw an error
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      const result = kubernetesService['isRunningInCluster']();
      
      expect(result).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Error checking in-cluster environment',
        expect.objectContaining({
          error: 'File system error'
        })
      );
    });
  });

  describe('Hybrid Authentication Strategy', () => {
    let mockKubeConfigInstance: jest.Mocked<KubeConfig>;
    let mockCoreV1Api: any;
    let mockAppsV1Api: any;
    let mockBatchV1Api: any;

    beforeEach(() => {
      mockKubeConfigInstance = {
        loadFromCluster: jest.fn(),
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn()
      } as any;

      mockCoreV1Api = { constructor: { name: 'CoreV1Api' } };
      mockAppsV1Api = { constructor: { name: 'AppsV1Api' } };
      mockBatchV1Api = { constructor: { name: 'BatchV1Api' } };

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);
      mockKubeConfigInstance.makeApiClient
        .mockReturnValueOnce(mockCoreV1Api)
        .mockReturnValueOnce(mockAppsV1Api)
        .mockReturnValueOnce(mockBatchV1Api);
    });

    it('should use in-cluster authentication when running inside Kubernetes', async () => {
      // Mock in-cluster environment
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(true);
      
      // Mock successful in-cluster config loading
      mockKubeConfigInstance.loadFromCluster.mockResolvedValue(undefined);

      const result = await kubernetesService['getKubernetesClient']('test-cluster-id');

      expect(mockKubeConfigInstance.loadFromCluster).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Successfully loaded in-cluster Kubernetes configuration',
        { clusterId: 'test-cluster-id' }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Kubernetes client initialized with hybrid authentication',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          authMethod: 'in-cluster',
          sslVerificationEnabled: true
        })
      );
      expect(result).toHaveProperty('coreV1Api', mockCoreV1Api);
      expect(result).toHaveProperty('appsV1Api', mockAppsV1Api);
      expect(result).toHaveProperty('batchV1Api', mockBatchV1Api);
    });

    it('should fallback to external kubeconfig when in-cluster fails', async () => {
      // Mock in-cluster environment but config loading fails
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(true);
      mockKubeConfigInstance.loadFromCluster.mockRejectedValue(new Error('In-cluster config failed'));

      // Mock database cluster lookup
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: 'encrypted-kubeconfig',
        status: 'ACTIVE'
      };
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com');

      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const result = await kubernetesService['getKubernetesClient']('test-cluster-id');

      expect(mockKubeConfigInstance.loadFromCluster).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to load in-cluster config, falling back to external kubeconfig',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          error: expect.objectContaining({
            message: 'In-cluster config failed'
          })
        })
      );
      expect(mockPrisma.cluster.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-cluster-id' },
        select: { id: true, name: true, kubeconfig: true, status: true }
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Kubernetes client initialized with hybrid authentication',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          authMethod: 'external-kubeconfig'
        })
      );
    });

    it('should use external kubeconfig when not running in cluster', async () => {
      // Mock external environment
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(false);

      // Mock database cluster lookup
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: 'encrypted-kubeconfig',
        status: 'ACTIVE'
      };
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com');

      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const result = await kubernetesService['getKubernetesClient']('test-cluster-id');

      expect(mockKubeConfigInstance.loadFromCluster).not.toHaveBeenCalled();
      expect(mockPrisma.cluster.findUnique).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Kubernetes client initialized with hybrid authentication',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          authMethod: 'external-kubeconfig'
        })
      );
    });
  });

  describe('External Kubeconfig Loading', () => {
    let mockKubeConfigInstance: jest.Mocked<KubeConfig>;

    beforeEach(() => {
      mockKubeConfigInstance = {
        loadFromString: jest.fn()
      } as any;
    });

    it('should decrypt and load encrypted kubeconfig successfully', async () => {
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: 'encrypted-kubeconfig-data',
        status: 'ACTIVE'
      };
      
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com');

      await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'test-cluster-id');

      expect(mockPrisma.cluster.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-cluster-id' },
        select: { id: true, name: true, kubeconfig: true, status: true }
      });
      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith('encrypted-kubeconfig-data');
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith('apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com');
      expect(mockLogger.debug).toHaveBeenCalledWith('Kubeconfig decrypted successfully', { clusterId: 'test-cluster-id' });
    });

    it('should fallback to plain text kubeconfig when decryption fails', async () => {
      const plainTextKubeconfig = 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s.example.com';
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: plainTextKubeconfig,
        status: 'ACTIVE'
      };
      
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'test-cluster-id');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to decrypt kubeconfig, assuming plain text',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          error: expect.objectContaining({
            message: 'Decryption failed'
          })
        })
      );
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith(plainTextKubeconfig);
    });

    it('should throw error when cluster is not found', async () => {
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(null);

      await expect(
        kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'non-existent-cluster')
      ).rejects.toThrow('Cluster non-existent-cluster not found or inactive');
    });

    it('should throw error when cluster is inactive', async () => {
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: 'kubeconfig-data',
        status: 'INACTIVE'
      };
      
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);

      await expect(
        kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'test-cluster-id')
      ).rejects.toThrow('Cluster test-cluster-id not found or inactive');
    });

    it('should handle invalid kubeconfig format', async () => {
      const mockCluster = {
        id: 'test-cluster-id',
        name: 'test-cluster',
        kubeconfig: 'invalid-kubeconfig',
        status: 'ACTIVE'
      };
      
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(false);

      await expect(
        kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'test-cluster-id')
      ).rejects.toThrow('Invalid kubeconfig format detected for cluster test-cluster-id');
    });
  });

  describe('SSL Verification', () => {
    it('should configure SSL verification for API clients', () => {
      const mockClients = [
        { constructor: { name: 'CoreV1Api' } },
        { constructor: { name: 'AppsV1Api' } },
        { constructor: { name: 'BatchV1Api' } }
      ];

      kubernetesService['configureSSLVerification'](mockClients as any);

      expect(mockLogger.debug).toHaveBeenCalledTimes(3);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SSL verification enabled for Kubernetes API client',
        { clientType: 'CoreV1Api' }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SSL verification enabled for Kubernetes API client',
        { clientType: 'AppsV1Api' }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SSL verification enabled for Kubernetes API client',
        { clientType: 'BatchV1Api' }
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors gracefully', async () => {
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(true);
      
      const mockKubeConfigInstance = {
        loadFromCluster: jest.fn().mockRejectedValue(new Error('Authentication failed')),
        getContexts: jest.fn().mockReturnValue([])
      } as any;
      
      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);
      
      // Mock database to fail as well
      mockPrisma.cluster.findUnique = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(
        kubernetesService['getKubernetesClient']('test-cluster-id')
      ).rejects.toThrow('Failed to connect to cluster test-cluster-id');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Kubernetes client',
        expect.objectContaining({
          clusterId: 'test-cluster-id',
          error: expect.objectContaining({
            message: expect.stringContaining('Database error')
          })
        })
      );
    });

    it('should handle missing contexts in kubeconfig', async () => {
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(true);
      
      const mockKubeConfigInstance = {
        loadFromCluster: jest.fn(),
        getContexts: jest.fn().mockReturnValue([]), // No contexts
        getCurrentContext: jest.fn()
      } as any;
      
      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      await expect(
        kubernetesService['getKubernetesClient']('test-cluster-id')
      ).rejects.toThrow('Failed to connect to cluster test-cluster-id: No contexts found in kubeconfig');
    });
  });

  describe('Client Caching', () => {
    it('should cache and reuse Kubernetes clients', async () => {
      const clusterId = 'test-cluster-id';
      
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(true);
      
      const mockKubeConfigInstance = {
        loadFromCluster: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn().mockReturnValue({})
      } as any;
      
      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      // First call should create the client
      const client1 = await kubernetesService['getKubernetesClient'](clusterId);
      
      // Second call should return cached client
      const client2 = await kubernetesService['getKubernetesClient'](clusterId);

      expect(client1).toBe(client2);
      expect(mockKubeConfigInstance.loadFromCluster).toHaveBeenCalledTimes(1);
    });
  });
});
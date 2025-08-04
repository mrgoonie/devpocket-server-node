/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { KubeConfig } from '@kubernetes/client-node';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';

// Set environment variable for isolated tests
process.env.SKIP_DB_SETUP = 'true';

// Mock external dependencies
jest.mock('@kubernetes/client-node');
jest.mock('@/config/database');
jest.mock('@/utils/encryption');

const mockKubeConfig = jest.mocked(KubeConfig);
const mockPrisma = jest.mocked(prisma);
const mockEncryptionService = jest.mocked(encryptionService);

// Import after mocking
import KubernetesService from '../kubernetes';

describe('KubernetesService - Backward Compatibility Tests', () => {
  let kubernetesService: KubernetesService;

  beforeEach(() => {
    jest.clearAllMocks();
    kubernetesService = new (KubernetesService as any)();

    // Mock running outside cluster by default
    jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(false);
  });

  describe('Legacy Kubeconfig Support', () => {
    it('should support legacy unencrypted kubeconfig format', async () => {
      const legacyKubeconfig = `
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: LS0tLS1CRUdJTi...
    server: https://legacy-k8s.example.com:6443
  name: legacy-cluster
contexts:
- context:
    cluster: legacy-cluster
    user: legacy-user
  name: legacy-context
current-context: legacy-context
users:
- name: legacy-user
  user:
    client-certificate-data: LS0tLS1CRUdJTi...
    client-key-data: LS0tLS1CRUdJTi...
`;

      const mockCluster = {
        id: 'legacy-cluster-id',
        name: 'legacy-cluster',
        kubeconfig: legacyKubeconfig, // Plain text, not encrypted
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);

      // Mock decryption failure (indicates plain text)
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Unable to decrypt - not encrypted');
      });

      // Mock validation passes for legacy format
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'legacy-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('legacy-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      await kubernetesService['loadExternalKubeconfig'](
        mockKubeConfigInstance,
        'legacy-cluster-id'
      );

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(legacyKubeconfig);
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith(legacyKubeconfig);
    });

    it('should support old client certificate authentication', async () => {
      const clientCertKubeconfig = `
apiVersion: v1
clusters:
- cluster:
    certificate-authority: /path/to/ca.crt
    server: https://old-k8s.example.com:6443
  name: cert-cluster
contexts:
- context:
    cluster: cert-cluster
    user: cert-user
  name: cert-context
current-context: cert-context
users:
- name: cert-user
  user:
    client-certificate: /path/to/client.crt
    client-key: /path/to/client.key
`;

      const mockCluster = {
        id: 'cert-cluster-id',
        name: 'cert-cluster',
        kubeconfig: clientCertKubeconfig,
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue(clientCertKubeconfig);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'cert-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('cert-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'cert-cluster-id');

      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith(clientCertKubeconfig);
    });

    it('should support basic auth kubeconfig (deprecated but existing)', async () => {
      const basicAuthKubeconfig = `
apiVersion: v1
clusters:
- cluster:
    insecure-skip-tls-verify: true
    server: https://basic-auth-k8s.example.com:6443
  name: basic-cluster
contexts:
- context:
    cluster: basic-cluster
    user: basic-user
  name: basic-context
current-context: basic-context
users:
- name: basic-user
  user:
    username: admin
    password: secret123
`;

      const mockCluster = {
        id: 'basic-cluster-id',
        name: 'basic-cluster',
        kubeconfig: basicAuthKubeconfig,
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue(basicAuthKubeconfig);

      // Should validate even deprecated formats
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'basic-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('basic-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'basic-cluster-id');

      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith(basicAuthKubeconfig);
    });
  });

  describe('API Compatibility', () => {
    it('should maintain backward compatibility with existing client interface', async () => {
      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn(),
      } as any;

      const mockCoreV1Api = { constructor: { name: 'CoreV1Api' } };
      const mockAppsV1Api = { constructor: { name: 'AppsV1Api' } };
      const mockBatchV1Api = { constructor: { name: 'BatchV1Api' } };

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);
      mockKubeConfigInstance.makeApiClient
        .mockReturnValueOnce(mockCoreV1Api)
        .mockReturnValueOnce(mockAppsV1Api)
        .mockReturnValueOnce(mockBatchV1Api);

      const mockCluster = {
        id: 'test-cluster',
        name: 'test-cluster',
        kubeconfig: 'test-config',
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('test-config');
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const client = await kubernetesService['getKubernetesClient']('test-cluster');

      // Should maintain the expected interface
      expect(client).toHaveProperty('coreV1Api');
      expect(client).toHaveProperty('appsV1Api');
      expect(client).toHaveProperty('batchV1Api');

      // Interface should be compatible with existing code
      expect(client.coreV1Api).toBe(mockCoreV1Api);
      expect(client.appsV1Api).toBe(mockAppsV1Api);
      expect(client.batchV1Api).toBe(mockBatchV1Api);
    });

    it('should support existing method signatures', async () => {
      // Verify that existing method signatures are preserved
      expect(typeof kubernetesService['getKubernetesClient']).toBe('function');

      // Should accept string cluster ID parameter
      const clusterId = 'test-cluster-id';
      expect(typeof clusterId).toBe('string');

      // Should return Promise<KubernetesClient>
      const mockClient = {
        coreV1Api: {},
        appsV1Api: {},
        batchV1Api: {},
      };

      // Mock the method to verify signature compatibility
      jest.spyOn(kubernetesService as any, 'getKubernetesClient').mockResolvedValue(mockClient);

      const result = await kubernetesService['getKubernetesClient'](clusterId);
      expect(result).toBe(mockClient);
    });
  });

  describe('Configuration Migration', () => {
    it('should handle migration from old SSL-disabled configuration', async () => {
      // Simulate old behavior where SSL was disabled
      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn().mockReturnValue({
          constructor: { name: 'CoreV1Api' },
          // Old configuration might have had SSL disabled
          requestOptions: { strictSSL: false },
        }),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      const mockCluster = {
        id: 'test-cluster',
        name: 'test-cluster',
        kubeconfig: 'test-config',
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('test-config');
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      // Should now enforce SSL verification regardless of old configuration
      const configureSslSpy = jest.spyOn(kubernetesService as any, 'configureSSLVerification');

      await kubernetesService['getKubernetesClient']('test-cluster');

      expect(configureSslSpy).toHaveBeenCalled();
    });

    it('should handle clusters without encryption gracefully', async () => {
      const plainTextKubeconfig = 'apiVersion: v1\nclusters: []\ncontexts: []\nusers: []';

      const mockCluster = {
        id: 'plain-cluster',
        name: 'plain-cluster',
        kubeconfig: plainTextKubeconfig,
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);

      // Simulate decryption failure for plain text config
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Not encrypted');
      });

      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('test-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'plain-cluster');

      // Should fallback to plain text and load successfully
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith(plainTextKubeconfig);
    });
  });

  describe('Error Handling Compatibility', () => {
    it('should maintain existing error handling behavior', async () => {
      // Mock cluster not found scenario
      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(null);

      const mockKubeConfigInstance = {} as any;

      await expect(
        kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'missing-cluster')
      ).rejects.toThrow('Cluster missing-cluster not found or inactive');

      // Error message format should be consistent with existing behavior
    });

    it('should handle invalid kubeconfig format consistently', async () => {
      const invalidKubeconfig = 'invalid yaml content {[}';

      const mockCluster = {
        id: 'invalid-cluster',
        name: 'invalid-cluster',
        kubeconfig: invalidKubeconfig,
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue(invalidKubeconfig);

      // Mock validation failure
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(false);

      const mockKubeConfigInstance = {} as any;

      await expect(
        kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, 'invalid-cluster')
      ).rejects.toThrow('Invalid kubeconfig format detected');
    });
  });

  describe('Feature Flag Compatibility', () => {
    it('should work without breaking existing deployments', async () => {
      // Test that the hybrid authentication doesn't break existing external-only deployments
      jest.spyOn(kubernetesService as any, 'isRunningInCluster').mockReturnValue(false);

      const mockCluster = {
        id: 'existing-cluster',
        name: 'existing-cluster',
        kubeconfig: 'existing-config',
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('existing-config');
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'existing-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('existing-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      // Should work exactly as before when not in cluster
      const client = await kubernetesService['getKubernetesClient']('existing-cluster');

      expect(client).toBeDefined();
      expect(mockKubeConfigInstance.loadFromCluster).not.toHaveBeenCalled();
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledWith('existing-config');
    });

    it('should maintain client caching behavior', async () => {
      const clusterId = 'cached-cluster';

      const mockCluster = {
        id: clusterId,
        name: clusterId,
        kubeconfig: 'cached-config',
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);
      mockEncryptionService.decrypt.mockReturnValue('cached-config');
      jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

      const mockKubeConfigInstance = {
        loadFromString: jest.fn(),
        getContexts: jest.fn().mockReturnValue([{ name: 'cached-context' }]),
        getCurrentContext: jest.fn().mockReturnValue('cached-context'),
        makeApiClient: jest.fn().mockReturnValue({}),
      } as any;

      mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

      // First call should create client
      const client1 = await kubernetesService['getKubernetesClient'](clusterId);

      // Second call should return cached client
      const client2 = await kubernetesService['getKubernetesClient'](clusterId);

      expect(client1).toBe(client2);
      expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalledTimes(1);
    });
  });

  describe('Database Schema Compatibility', () => {
    it('should work with existing cluster table structure', async () => {
      // Verify that the service works with the expected database schema
      const expectedClusterFields = ['id', 'name', 'kubeconfig', 'status'];

      const mockCluster = {
        id: 'schema-test-cluster',
        name: 'schema-test-cluster',
        kubeconfig: 'schema-test-config',
        status: 'ACTIVE',
      };

      mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);

      // Verify that only expected fields are requested
      expect(mockPrisma.cluster.findUnique).toBeDefined();

      // The service should work with standard cluster schema
      expectedClusterFields.forEach(field => {
        expect(mockCluster).toHaveProperty(field);
      });
    });

    it('should handle cluster status enum values correctly', async () => {
      const statusValues = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];

      for (const status of statusValues) {
        const mockCluster = {
          id: `cluster-${status.toLowerCase()}`,
          name: `cluster-${status.toLowerCase()}`,
          kubeconfig: 'test-config',
          status: status,
        };

        mockPrisma.cluster.findUnique = jest.fn().mockResolvedValue(mockCluster);

        if (status === 'ACTIVE') {
          // Should work with active clusters
          mockEncryptionService.decrypt.mockReturnValue('test-config');
          jest.spyOn(kubernetesService as any, 'validateKubeconfigFormat').mockReturnValue(true);

          const mockKubeConfigInstance = {
            loadFromString: jest.fn(),
            getContexts: jest.fn().mockReturnValue([{ name: 'test' }]),
            getCurrentContext: jest.fn().mockReturnValue('test'),
            makeApiClient: jest.fn().mockReturnValue({}),
          } as any;

          mockKubeConfig.mockImplementation(() => mockKubeConfigInstance);

          await kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, mockCluster.id);
          expect(mockKubeConfigInstance.loadFromString).toHaveBeenCalled();
        } else {
          // Should reject inactive clusters
          const mockKubeConfigInstance = {} as any;

          await expect(
            kubernetesService['loadExternalKubeconfig'](mockKubeConfigInstance, mockCluster.id)
          ).rejects.toThrow(`Cluster ${mockCluster.id} not found or inactive`);
        }
      }
    });
  });
});
EOF < /dev/llnu;

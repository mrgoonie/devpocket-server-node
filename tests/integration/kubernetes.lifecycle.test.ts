import { jest } from '@jest/globals';
import { KubernetesError } from '@/types/errors';

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

// Mock Kubernetes client with more realistic behavior
const mockCoreV1Api = {
  readNamespace: jest.fn(),
  createNamespace: jest.fn(),
  createNamespacedPersistentVolumeClaim: jest.fn(),
  createNamespacedConfigMap: jest.fn(),
  createNamespacedService: jest.fn(),
  deleteNamespacedService: jest.fn(),
  deleteNamespacedPersistentVolumeClaim: jest.fn(),
  deleteNamespacedConfigMap: jest.fn(),
  listNamespacedPod: jest.fn(),
  readNamespacedPodLog: jest.fn(),
};

const mockAppsV1Api = {
  createNamespacedDeployment: jest.fn(),
  readNamespacedDeployment: jest.fn(),
  patchNamespacedDeployment: jest.fn(),
  deleteNamespacedDeployment: jest.fn(),
};

const mockKubeConfig = {
  getContexts: jest.fn().mockReturnValue([{ name: 'test-context' }]),
  getCurrentContext: jest.fn().mockReturnValue('test-context'),
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

// Mock Prisma with state simulation
const mockPrisma = {
  cluster: {
    findUnique: jest.fn(),
  },
  environment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@/config/database', () => ({
  prisma: mockPrisma,
}));

// Mock encryption service
jest.mock('@/utils/encryption', () => ({
  encryptionService: {
    decrypt: jest.fn(),
  },
}));

// Mock logger
jest.mock('@/config/logger', () => ({
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  serializeError: jest.fn().mockImplementation(error => ({
    name: error.name,
    message: error.message,
    stack: error.stack,
  })),
}));

// Mock yaml
jest.mock('yaml', () => ({
  parse: jest.fn().mockImplementation(() => ({ kind: 'Config' })),
}));

import { kubernetesService } from '@/services/kubernetes';

describe('KubernetesService - Integration Lifecycle Tests', () => {
  const testEnvironment = {
    id: 'env-integration-123',
    userId: 'user-integration-123',
    clusterId: 'cluster-integration-123',
  };

  const environmentOptions = {
    environmentId: testEnvironment.id,
    userId: testEnvironment.userId,
    name: 'integration-test-env',
    dockerImage: 'node:18-alpine',
    port: 8080,
    resources: {
      cpu: '500m',
      memory: '1Gi',
      storage: '5Gi',
    },
    environmentVariables: {
      NODE_ENV: 'development',
      PORT: '8080',
    },
    startupCommands: ['npm install', 'npm run build', 'npm start'],
  };

  const validKubeconfig = `
apiVersion: v1
kind: Config
clusters:
- name: integration-cluster
  cluster:
    server: https://integration.k8s.local
contexts:
- name: integration-context
  context:
    cluster: integration-cluster
    user: integration-user
users:
- name: integration-user
  user:
    token: integration-token
current-context: integration-context
`;

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear service cache
    (kubernetesService as any).clients.clear();
    (kubernetesService as any).kubeConfigs.clear();

    // Setup default mocks
    mockKubeConfig.makeApiClient.mockImplementation(ApiClient => {
      if (ApiClient.name === 'CoreV1Api') return mockCoreV1Api;
      if (ApiClient.name === 'AppsV1Api') return mockAppsV1Api;
      return {};
    });

    mockPrisma.cluster.findUnique.mockResolvedValue({
      id: testEnvironment.clusterId,
      name: 'Integration Cluster',
      kubeconfig: validKubeconfig,
      status: 'ACTIVE',
    });

    mockPrisma.environment.findUnique.mockResolvedValue({
      clusterId: testEnvironment.clusterId,
    });

    mockPrisma.environment.update.mockResolvedValue({});
  });

  describe('Complete Environment Lifecycle', () => {
    it('should create, start, stop, and delete environment successfully', async () => {
      // Mock successful Kubernetes operations for creation
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValueOnce({ body: {} });

      // STEP 1: Create Environment
      const createResult = await kubernetesService.createEnvironment(environmentOptions);

      expect(createResult).toMatchObject({
        status: 'PROVISIONING',
        deploymentName: `env-${testEnvironment.id}`,
        serviceName: `svc-${testEnvironment.id}`,
        namespace: `devpocket-${testEnvironment.userId}`,
      });

      // Verify all resources were created
      expect(mockCoreV1Api.createNamespace).toHaveBeenCalledTimes(1);
      expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalledTimes(1);
      expect(mockCoreV1Api.createNamespacedConfigMap).toHaveBeenCalledTimes(1);
      expect(mockAppsV1Api.createNamespacedDeployment).toHaveBeenCalledTimes(1);
      expect(mockCoreV1Api.createNamespacedService).toHaveBeenCalledTimes(1);

      // Update environment mock to reflect created state
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: testEnvironment.clusterId,
        kubernetesNamespace: `devpocket-${testEnvironment.userId}`,
        kubernetesPodName: `env-${testEnvironment.id}`,
        kubernetesServiceName: `svc-${testEnvironment.id}`,
      });

      // STEP 2: Start Environment (scale up)
      mockAppsV1Api.patchNamespacedDeployment.mockResolvedValueOnce({ body: {} });

      await kubernetesService.startEnvironment(testEnvironment.id);

      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalledWith(
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`,
        [{ op: 'replace', path: '/spec/replicas', value: 1 }],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: testEnvironment.id },
        data: { status: 'RUNNING' },
      });

      // STEP 3: Get Environment Info (should show running)
      mockAppsV1Api.readNamespacedDeployment.mockResolvedValueOnce({
        body: {
          status: { readyReplicas: 1 },
          spec: { replicas: 1 },
        },
      });
      mockCoreV1Api.listNamespacedPod.mockResolvedValueOnce({
        body: {
          items: [{ metadata: { name: 'test-pod' }, status: { phase: 'Running' } }],
        },
      });

      const envInfo = await kubernetesService.getEnvironmentInfo(testEnvironment.id);

      expect(envInfo.status).toBe('RUNNING');
      expect(envInfo.deploymentName).toBe(`env-${testEnvironment.id}`);

      // STEP 4: Stop Environment (scale down)
      mockAppsV1Api.patchNamespacedDeployment.mockResolvedValueOnce({ body: {} });

      await kubernetesService.stopEnvironment(testEnvironment.id);

      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalledWith(
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`,
        [{ op: 'replace', path: '/spec/replicas', value: 0 }],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: testEnvironment.id },
        data: { status: 'STOPPING' },
      });

      // STEP 5: Verify Stopped State
      mockAppsV1Api.readNamespacedDeployment.mockResolvedValueOnce({
        body: {
          status: { readyReplicas: 0 },
          spec: { replicas: 0 },
        },
      });

      const stoppedInfo = await kubernetesService.getEnvironmentInfo(testEnvironment.id);
      expect(stoppedInfo.status).toBe('STOPPED');

      // STEP 6: Delete Environment
      mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedService.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValueOnce({ body: {} });

      await kubernetesService.deleteEnvironment(testEnvironment.id);

      // Verify all resources were deleted
      expect(mockAppsV1Api.deleteNamespacedDeployment).toHaveBeenCalledWith(
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );
      expect(mockCoreV1Api.deleteNamespacedService).toHaveBeenCalledWith(
        `svc-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );
      expect(mockCoreV1Api.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        `pvc-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );
      expect(mockCoreV1Api.deleteNamespacedConfigMap).toHaveBeenCalledWith(
        `config-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );

      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: testEnvironment.id },
        data: { status: 'TERMINATED' },
      });
    });

    it('should handle environment restart sequence correctly', async () => {
      // Setup environment as already created
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: testEnvironment.clusterId,
        kubernetesNamespace: `devpocket-${testEnvironment.userId}`,
        kubernetesPodName: `env-${testEnvironment.id}`,
        kubernetesServiceName: `svc-${testEnvironment.id}`,
      });

      // Mock successful operations
      mockAppsV1Api.patchNamespacedDeployment.mockResolvedValue({ body: {} });

      // Stop -> Start -> Stop sequence
      await kubernetesService.stopEnvironment(testEnvironment.id);
      await kubernetesService.startEnvironment(testEnvironment.id);
      await kubernetesService.stopEnvironment(testEnvironment.id);

      // Verify scaling operations
      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenCalledTimes(3);

      // First call: scale to 0 (stop)
      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenNthCalledWith(
        1,
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`,
        [{ op: 'replace', path: '/spec/replicas', value: 0 }],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      // Second call: scale to 1 (start)
      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenNthCalledWith(
        2,
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`,
        [{ op: 'replace', path: '/spec/replicas', value: 1 }],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      // Third call: scale to 0 (stop again)
      expect(mockAppsV1Api.patchNamespacedDeployment).toHaveBeenNthCalledWith(
        3,
        `env-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`,
        [{ op: 'replace', path: '/spec/replicas', value: 0 }],
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      // Verify database updates
      expect(mockPrisma.environment.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.environment.update).toHaveBeenNthCalledWith(1, {
        where: { id: testEnvironment.id },
        data: { status: 'STOPPING' },
      });
      expect(mockPrisma.environment.update).toHaveBeenNthCalledWith(2, {
        where: { id: testEnvironment.id },
        data: { status: 'RUNNING' },
      });
      expect(mockPrisma.environment.update).toHaveBeenNthCalledWith(3, {
        where: { id: testEnvironment.id },
        data: { status: 'STOPPING' },
      });
    });

    it('should handle partial creation failure and cleanup correctly', async () => {
      // Mock successful initial operations
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });

      // Make deployment creation fail
      mockAppsV1Api.createNamespacedDeployment.mockRejectedValueOnce(
        new Error('Insufficient resources in cluster')
      );

      // Mock cleanup operations
      mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedService.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValueOnce({ body: {} });

      // Attempt creation (should fail)
      await expect(kubernetesService.createEnvironment(environmentOptions)).rejects.toThrow(
        KubernetesError
      );

      // Verify cleanup was attempted
      expect(mockCoreV1Api.deleteNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        `pvc-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );
      expect(mockCoreV1Api.deleteNamespacedConfigMap).toHaveBeenCalledWith(
        `config-${testEnvironment.id}`,
        `devpocket-${testEnvironment.userId}`
      );

      // Verify environment status was updated to ERROR
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: testEnvironment.id },
        data: {
          status: 'ERROR',
          lastError: expect.stringContaining('Insufficient resources in cluster'),
        },
      });
    });

    it('should handle environment logs retrieval throughout lifecycle', async () => {
      // Setup environment as deployed
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: testEnvironment.clusterId,
        kubernetesNamespace: `devpocket-${testEnvironment.userId}`,
        kubernetesPodName: `env-${testEnvironment.id}`,
      });

      // Mock pod listing
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [{ metadata: { name: 'test-pod-123' } }],
        },
      });

      // Mock log retrieval
      const mockLogs = 'Application started\nListening on port 8080\nReady to accept connections';
      mockCoreV1Api.readNamespacedPodLog.mockResolvedValue({
        body: mockLogs,
      });

      const logs = await kubernetesService.getEnvironmentLogs(testEnvironment.id, 100, false);

      expect(logs).toBe(mockLogs);
      expect(mockCoreV1Api.readNamespacedPodLog).toHaveBeenCalledWith(
        'test-pod-123',
        `devpocket-${testEnvironment.userId}`,
        'devpocket',
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        100,
        undefined
      );
    });

    it('should handle command execution in running environment', async () => {
      // Setup environment as deployed
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: testEnvironment.clusterId,
        kubernetesNamespace: `devpocket-${testEnvironment.userId}`,
        kubernetesPodName: `env-${testEnvironment.id}`,
      });

      // Setup kubeconfig in cache
      (kubernetesService as any).kubeConfigs.set(testEnvironment.clusterId, mockKubeConfig);

      // Mock running pods
      mockCoreV1Api.listNamespacedPod.mockResolvedValue({
        body: {
          items: [
            {
              metadata: { name: 'test-pod-123' },
              status: { phase: 'Running' },
            },
          ],
        },
      });

      // Mock Exec constructor and execution
      const mockExecInstance = {
        exec: jest
          .fn()
          .mockImplementation(
            (namespace, pod, container, command, stdout, stderr, stdin, tty, callback) => {
              callback({ status: 'Success' });
            }
          ),
      };

      (require('@kubernetes/client-node').Exec as jest.Mock).mockImplementation(
        () => mockExecInstance
      );

      const result = await kubernetesService.executeCommand(testEnvironment.id, 'ps aux');

      expect(result.success).toBe(true);
      expect(mockExecInstance.exec).toHaveBeenCalledWith(
        `devpocket-${testEnvironment.userId}`,
        'test-pod-123',
        'devpocket',
        ['/bin/bash', '-c', 'ps aux'],
        expect.any(Object),
        expect.any(Object),
        null,
        true,
        expect.any(Function)
      );
    });
  });

  describe('Parallel Operations', () => {
    it('should create PVC and ConfigMap in parallel during environment creation', async () => {
      // Mock successful operations
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });

      // Track call order using resolved promises
      const callOrder: string[] = [];

      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockImplementation(async () => {
        callOrder.push('pvc');
        return { body: {} };
      });

      mockCoreV1Api.createNamespacedConfigMap.mockImplementation(async () => {
        callOrder.push('configmap');
        return { body: {} };
      });

      mockAppsV1Api.createNamespacedDeployment.mockImplementation(async () => {
        callOrder.push('deployment');
        return { body: {} };
      });

      mockCoreV1Api.createNamespacedService.mockImplementation(async () => {
        callOrder.push('service');
        return { body: {} };
      });

      await kubernetesService.createEnvironment(environmentOptions);

      // Verify that PVC and ConfigMap were called before deployment
      const pvcIndex = callOrder.indexOf('pvc');
      const configmapIndex = callOrder.indexOf('configmap');
      const deploymentIndex = callOrder.indexOf('deployment');
      const serviceIndex = callOrder.indexOf('service');

      expect(pvcIndex).toBeGreaterThanOrEqual(0);
      expect(configmapIndex).toBeGreaterThanOrEqual(0);
      expect(deploymentIndex).toBeGreaterThanOrEqual(0);
      expect(serviceIndex).toBeGreaterThanOrEqual(0);

      // PVC and ConfigMap should both be called before deployment
      expect(Math.max(pvcIndex, configmapIndex)).toBeLessThan(deploymentIndex);
      // Service should be called after deployment
      expect(deploymentIndex).toBeLessThan(serviceIndex);
    });

    it('should handle parallel operation failures correctly', async () => {
      // Mock namespace creation success
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });

      // Make PVC creation fail
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockRejectedValueOnce(
        new Error('Storage quota exceeded')
      );

      // ConfigMap creation should still be attempted
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });

      // Mock cleanup
      mockAppsV1Api.deleteNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedService.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValueOnce({ body: {} });

      await expect(kubernetesService.createEnvironment(environmentOptions)).rejects.toThrow(
        /Storage quota exceeded/
      );

      // Verify both operations were attempted
      expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalled();
      expect(mockCoreV1Api.createNamespacedConfigMap).toHaveBeenCalled();

      // Deployment should not be attempted since parallel operations failed
      expect(mockAppsV1Api.createNamespacedDeployment).not.toHaveBeenCalled();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle transient network errors with retry mechanism', async () => {
      // Mock temporary failure followed by success
      mockCoreV1Api.readNamespace
        .mockRejectedValueOnce(new Error('connection timeout'))
        .mockRejectedValueOnce(new Error('connection timeout'))
        .mockRejectedValueOnce(new Error('Namespace not found')); // Success case

      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValueOnce({ body: {} });

      const result = await kubernetesService.createEnvironment(environmentOptions);

      expect(result.status).toBe('PROVISIONING');
      // Should have retried the namespace check 3 times
      expect(mockCoreV1Api.readNamespace).toHaveBeenCalledTimes(3);
    });

    it('should handle authentication errors without retry', async () => {
      mockCoreV1Api.readNamespace.mockRejectedValue(new Error('authentication failed'));

      await expect(kubernetesService.createEnvironment(environmentOptions)).rejects.toThrow(
        KubernetesError
      );

      // Should not retry authentication failures
      expect(mockCoreV1Api.readNamespace).toHaveBeenCalledTimes(1);
    });

    it('should handle resource deletion failures during cleanup gracefully', async () => {
      // Setup environment for deletion
      mockPrisma.environment.findUnique.mockResolvedValue({
        clusterId: testEnvironment.clusterId,
        kubernetesNamespace: `devpocket-${testEnvironment.userId}`,
        kubernetesPodName: `env-${testEnvironment.id}`,
        kubernetesServiceName: `svc-${testEnvironment.id}`,
      });

      // Mock partial deletion failures
      mockAppsV1Api.deleteNamespacedDeployment.mockRejectedValue(new Error('Deployment not found'));
      mockCoreV1Api.deleteNamespacedService.mockRejectedValue(new Error('Service not found'));
      mockCoreV1Api.deleteNamespacedPersistentVolumeClaim.mockResolvedValue({ body: {} });
      mockCoreV1Api.deleteNamespacedConfigMap.mockResolvedValue({ body: {} });

      // Should not throw despite partial failures
      await expect(kubernetesService.deleteEnvironment(testEnvironment.id)).resolves.not.toThrow();

      // Should still update environment status
      expect(mockPrisma.environment.update).toHaveBeenCalledWith({
        where: { id: testEnvironment.id },
        data: { status: 'TERMINATED' },
      });
    });
  });

  describe('Resource Configuration Validation', () => {
    it('should create deployment with correct resource specifications', async () => {
      // Mock successful operations
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValueOnce({ body: {} });

      await kubernetesService.createEnvironment(environmentOptions);

      // Verify deployment was created with correct resource specifications
      expect(mockAppsV1Api.createNamespacedDeployment).toHaveBeenCalledWith(
        `devpocket-${testEnvironment.userId}`,
        expect.objectContaining({
          spec: expect.objectContaining({
            template: expect.objectContaining({
              spec: expect.objectContaining({
                containers: expect.arrayContaining([
                  expect.objectContaining({
                    resources: {
                      requests: {
                        cpu: '500m',
                        memory: '1Gi',
                      },
                      limits: {
                        cpu: '500m',
                        memory: '1Gi',
                      },
                    },
                  }),
                ]),
              }),
            }),
          }),
        })
      );
    });

    it('should create PVC with correct storage specifications', async () => {
      // Mock successful operations
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValueOnce({ body: {} });

      await kubernetesService.createEnvironment(environmentOptions);

      // Verify PVC was created with correct storage specifications
      expect(mockCoreV1Api.createNamespacedPersistentVolumeClaim).toHaveBeenCalledWith(
        `devpocket-${testEnvironment.userId}`,
        expect.objectContaining({
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: '5Gi',
              },
            },
          },
        })
      );
    });

    it('should create service with correct port configurations', async () => {
      // Mock successful operations
      mockCoreV1Api.readNamespace.mockRejectedValueOnce(new Error('Namespace not found'));
      mockCoreV1Api.createNamespace.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedPersistentVolumeClaim.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedConfigMap.mockResolvedValueOnce({ body: {} });
      mockAppsV1Api.createNamespacedDeployment.mockResolvedValueOnce({ body: {} });
      mockCoreV1Api.createNamespacedService.mockResolvedValueOnce({ body: {} });

      await kubernetesService.createEnvironment(environmentOptions);

      // Verify service was created with correct port configurations
      expect(mockCoreV1Api.createNamespacedService).toHaveBeenCalledWith(
        `devpocket-${testEnvironment.userId}`,
        expect.objectContaining({
          spec: {
            selector: {
              app: `env-${testEnvironment.id}`,
            },
            ports: [
              { port: 8080, targetPort: 8080, name: 'app-port' },
              { port: 22, targetPort: 22, name: 'ssh' },
            ],
            type: 'ClusterIP',
          },
        })
      );
    });
  });
});

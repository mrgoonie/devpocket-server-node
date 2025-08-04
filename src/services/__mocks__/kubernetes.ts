/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { jest } from '@jest/globals';

// Mock implementation of KubernetesService for testing
export class MockKubernetesService {
  private clients: Map<string, any> = new Map();

  // Mock the authentication detection method
  isRunningInCluster = jest.fn().mockReturnValue(false);

  // Mock client creation
  getKubernetesClient = jest.fn<any, any>().mockResolvedValue({
    coreV1Api: {
      createNamespace: jest.fn(),
      listNamespaces: jest.fn(),
      deleteNamespace: jest.fn(),
      createPersistentVolumeClaim: jest.fn(),
      listPersistentVolumeClaims: jest.fn(),
      deletePersistentVolumeClaim: jest.fn(),
      createConfigMap: jest.fn(),
      listConfigMaps: jest.fn(),
      deleteConfigMap: jest.fn(),
      listPods: jest.fn(),
      createPod: jest.fn(),
      deletePod: jest.fn(),
      createService: jest.fn(),
      listServices: jest.fn(),
      deleteService: jest.fn(),
    },
    appsV1Api: {
      createDeployment: jest.fn(),
      listDeployments: jest.fn(),
      deleteDeployment: jest.fn(),
      patchDeployment: jest.fn(),
    },
    batchV1Api: {
      createJob: jest.fn(),
      listJobs: jest.fn(),
      deleteJob: jest.fn(),
    },
  });

  // Mock external kubeconfig loading
  loadExternalKubeconfig = jest.fn().mockResolvedValue(undefined);

  // Mock SSL configuration
  configureSSLVerification = jest.fn();

  // Mock kubeconfig validation
  validateKubeconfigFormat = jest.fn().mockReturnValue(true);

  // Environment creation methods
  createEnvironment = jest.fn().mockResolvedValue({
    id: 'test-env-id',
    status: 'running',
    podName: 'test-pod',
    serviceName: 'test-service',
    namespace: 'test-namespace',
    internalUrl: 'http://test-service.test-namespace.svc.cluster.local:8080',
  });

  deleteEnvironment = jest.fn().mockResolvedValue(undefined);
  getEnvironmentInfo = jest.fn().mockResolvedValue({
    status: 'running',
    podName: 'test-pod',
    serviceName: 'test-service',
    namespace: 'test-namespace',
  });

  // Additional mock methods for comprehensive testing
  startEnvironment = jest.fn().mockResolvedValue(undefined);
  stopEnvironment = jest.fn().mockResolvedValue(undefined);
  restartEnvironment = jest.fn().mockResolvedValue(undefined);
  getEnvironmentLogs = jest.fn().mockResolvedValue([]);

  // Mock client caching
  clearClientCache = jest.fn().mockImplementation(() => {
    this.clients.clear();
  });

  // Mock SSL verification flag
  isSSLVerificationEnabled = jest.fn().mockReturnValue(true);

  // Mock authentication method detection
  getAuthenticationMethod = jest.fn().mockResolvedValue('external-kubeconfig');
}

// Create singleton instance for consistent mocking
const mockKubernetesService = new MockKubernetesService();

export default mockKubernetesService;

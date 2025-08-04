// Isolated test for Kubernetes service mock
// This test doesn't require database or external dependencies

import { jest } from '@jest/globals';

// Mock the kubernetes module completely for this test
jest.mock('@/services/kubernetes', () => ({
  kubernetesService: {
    createEnvironment: jest.fn(),
    getEnvironmentInfo: jest.fn(),
    startEnvironment: jest.fn(),
    stopEnvironment: jest.fn(),
    deleteEnvironment: jest.fn(),
    executeCommand: jest.fn(),
    getEnvironmentLogs: jest.fn(),
  },
}));

describe('Kubernetes Service - Isolated Mock Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be properly mocked and isolated', () => {
    // This test just verifies that our jest setup works correctly
    expect(jest).toBeDefined();
  });

  it('should have required environment variables set', () => {
    expect(process.env.JWT_SECRET).toBeDefined();
    expect(process.env.JWT_SECRET).toBeTruthy();
  });

  it('should mock kubernetes service methods', async () => {
    const { kubernetesService } = await import('@/services/kubernetes');

    expect(kubernetesService.createEnvironment).toBeDefined();
    expect(kubernetesService.getEnvironmentInfo).toBeDefined();
    expect(kubernetesService.startEnvironment).toBeDefined();
    expect(kubernetesService.stopEnvironment).toBeDefined();
    expect(kubernetesService.deleteEnvironment).toBeDefined();
    expect(kubernetesService.executeCommand).toBeDefined();
    expect(kubernetesService.getEnvironmentLogs).toBeDefined();
  });
});

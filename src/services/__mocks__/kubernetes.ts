// Mock implementation of the Kubernetes service for testing

interface EnvironmentInfo {
  status: string;
  podName?: string;
  serviceName?: string;
  namespace: string;
  internalUrl?: string;
  externalUrl?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  storageUsage?: number;
}

interface EnvironmentCreateOptions {
  environmentId: string;
  userId: string;
  name: string;
  dockerImage: string;
  port: number;
  resources: {
    cpu: string;
    memory: string;
    storage: string;
  };
  environmentVariables: Record<string, string>;
  startupCommands?: string[];
}

class MockKubernetesService {
  private environments: Map<string, EnvironmentInfo> = new Map();

  async createEnvironment(options: EnvironmentCreateOptions): Promise<EnvironmentInfo> {
    const environmentInfo: EnvironmentInfo = {
      status: 'PROVISIONING',
      podName: `env-${options.environmentId}`,
      serviceName: `svc-${options.environmentId}`,
      namespace: `devpocket-${options.userId}`,
      internalUrl: `http://svc-${options.environmentId}.devpocket-${options.userId}.svc.cluster.local:${options.port}`,
    };

    this.environments.set(options.environmentId, environmentInfo);
    return environmentInfo;
  }

  async getEnvironmentInfo(environmentId: string): Promise<EnvironmentInfo> {
    const env = this.environments.get(environmentId);
    if (!env) {
      return { status: 'NOT_DEPLOYED', namespace: 'unknown' };
    }
    return {
      ...env,
      cpuUsage: Math.random() * 100,
      memoryUsage: Math.random() * 100,
      storageUsage: Math.random() * 100,
    };
  }

  async startEnvironment(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId);
    if (env) {
      env.status = 'RUNNING';
      this.environments.set(environmentId, env);
    }
  }

  async stopEnvironment(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId);
    if (env) {
      env.status = 'STOPPED';
      this.environments.set(environmentId, env);
    }
  }

  async deleteEnvironment(environmentId: string): Promise<void> {
    const env = this.environments.get(environmentId);
    if (env) {
      env.status = 'TERMINATED';
      this.environments.set(environmentId, env);
    }
  }

  async executeCommand(
    environmentId: string,
    command: string,
    _stdin?: boolean
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const env = this.environments.get(environmentId);
    if (!env) {
      return { success: false, error: 'Environment not found' };
    }

    return {
      success: true,
      output: `Mock output for command: ${command}`,
    };
  }

  async getEnvironmentLogs(
    environmentId: string,
    _lines: number = 100,
    _follow: boolean = false
  ): Promise<string> {
    const env = this.environments.get(environmentId);
    if (!env) {
      return 'Environment not found';
    }

    return `Mock logs for environment ${environmentId}\nLine 1: Container started\nLine 2: Application ready`;
  }

  // Test helper methods
  _setEnvironmentStatus(environmentId: string, status: string): void {
    const env = this.environments.get(environmentId);
    if (env) {
      env.status = status;
      this.environments.set(environmentId, env);
    }
  }

  _clearEnvironments(): void {
    this.environments.clear();
  }
}

const mockKubernetesService = new MockKubernetesService();

export const kubernetesService = mockKubernetesService;
export default mockKubernetesService;

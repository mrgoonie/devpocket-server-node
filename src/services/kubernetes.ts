import { 
  KubeConfig, 
  CoreV1Api, 
  AppsV1Api, 
  BatchV1Api,
  Exec,
  V1Pod, 
  V1Service, 
  V1ConfigMap, 
  V1PersistentVolumeClaim
} from '@kubernetes/client-node';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';
import logger from '@/config/logger';
import { KubernetesError } from '@/types/errors';

interface KubernetesClient {
  coreV1Api: CoreV1Api;
  appsV1Api: AppsV1Api;
  batchV1Api: BatchV1Api;
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

class KubernetesService {
  private clients: Map<string, KubernetesClient> = new Map();
  private kubeConfigs: Map<string, KubeConfig> = new Map();

  /**
   * Initialize Kubernetes client for a cluster
   */
  private async getKubernetesClient(clusterId: string): Promise<KubernetesClient> {
    if (this.clients.has(clusterId)) {
      return this.clients.get(clusterId)!;
    }

    try {
      // Get cluster configuration from database
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
        select: {
          id: true,
          name: true,
          kubeconfig: true,
          status: true,
        },
      });

      if (!cluster || cluster.status !== 'ACTIVE') {
        throw new Error(`Cluster ${clusterId} not found or inactive`);
      }

      // Initialize Kubernetes configuration
      const kc = new KubeConfig();
      
      // Decrypt the kubeconfig content
      let kubeconfig: string;
      try {
        kubeconfig = encryptionService.decrypt(cluster.kubeconfig);
        logger.debug('Kubeconfig decrypted successfully', { clusterId });
      } catch (decryptError) {
        // Fallback: assume it's plain text (backwards compatibility)
        // In production, you might want to enforce encryption
        logger.warn('Failed to decrypt kubeconfig, assuming plain text', { 
          clusterId, 
          error: decryptError instanceof Error ? decryptError.message : 'Unknown error',
          kubeconfigLength: cluster.kubeconfig.length
        });
        kubeconfig = cluster.kubeconfig;
        
        // Validate that the plain text kubeconfig at least looks valid
        if (!kubeconfig.includes('apiVersion') || !kubeconfig.includes('clusters')) {
          throw new Error('Invalid kubeconfig format detected');
        }
      }
      
      kc.loadFromString(kubeconfig);

      // Create API clients
      const coreV1Api = kc.makeApiClient(CoreV1Api);
      const appsV1Api = kc.makeApiClient(AppsV1Api);
      const batchV1Api = kc.makeApiClient(BatchV1Api);

      const client = {
        coreV1Api,
        appsV1Api,
        batchV1Api,
      };

      this.clients.set(clusterId, client);
      this.kubeConfigs.set(clusterId, kc);

      logger.info('Kubernetes client initialized', { clusterId, clusterName: cluster.name });
      return client;
    } catch (error) {
      logger.error('Failed to initialize Kubernetes client', { clusterId, error });
      throw new KubernetesError(`Failed to connect to cluster ${clusterId}`);
    }
  }

  /**
   * Create a new development environment in Kubernetes
   */
  async createEnvironment(options: EnvironmentCreateOptions): Promise<EnvironmentInfo> {
    const {
      environmentId,
      userId,
      name: _name,
      dockerImage,
      port,
      resources,
      environmentVariables,
      startupCommands = [],
    } = options;

    try {
      // Get cluster for this environment
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: { clusterId: true },
      });

      if (!environment) {
        throw new Error('Environment not found');
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      const namespace = `devpocket-${userId}`;
      const podName = `env-${environmentId}`;
      const serviceName = `svc-${environmentId}`;
      const pvcName = `pvc-${environmentId}`;
      const configMapName = `config-${environmentId}`;

      // Ensure namespace exists
      await this.ensureNamespace(client, namespace);

      // Create persistent volume claim for workspace storage
      await this.createPersistentVolumeClaim(client, namespace, pvcName, resources.storage);

      // Create ConfigMap with startup scripts
      await this.createConfigMap(client, namespace, configMapName, startupCommands);

      // Create pod for the environment
      await this.createPod(client, namespace, {
        podName,
        dockerImage,
        port,
        resources,
        environmentVariables,
        pvcName,
        configMapName,
      });

      // Create service to expose the pod
      await this.createService(client, namespace, serviceName, podName, port);

      // Update environment with Kubernetes details
      await prisma.environment.update({
        where: { id: environmentId },
        data: {
          status: 'PROVISIONING',
          kubernetesNamespace: namespace,
          kubernetesPodName: podName,
          kubernetesServiceName: serviceName,
          externalUrl: `http://${serviceName}.${namespace}.svc.cluster.local:${port}`,
        },
      });

      logger.info('Environment created in Kubernetes', {
        environmentId,
        namespace,
        podName,
        serviceName,
      });

      return {
        status: 'PROVISIONING',
        podName,
        serviceName,
        namespace,
        internalUrl: `http://${serviceName}.${namespace}.svc.cluster.local:${port}`,
      };
    } catch (error) {
      logger.error('Failed to create environment in Kubernetes', { environmentId, error });
      
      // Update environment status to error
      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'ERROR' },
      });

      throw new KubernetesError('Failed to create environment');
    }
  }

  /**
   * Get environment status and info from Kubernetes
   */
  async getEnvironmentInfo(environmentId: string): Promise<EnvironmentInfo> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
          kubernetesServiceName: true,
        },
      });

      if (!environment?.kubernetesNamespace || !environment?.kubernetesPodName) {
        return { status: 'NOT_DEPLOYED', namespace: 'unknown' };
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      const { kubernetesNamespace: namespace, kubernetesPodName: podName } = environment;

      // Get pod status
      const podResponse = await client.coreV1Api.readNamespacedPod(podName, namespace);
      const pod = podResponse.body;

      let status = 'UNKNOWN';
      if (pod.status?.phase === 'Running') {
        status = 'RUNNING';
      } else if (pod.status?.phase === 'Pending') {
        status = 'PROVISIONING';
      } else if (pod.status?.phase === 'Failed') {
        status = 'ERROR';
      } else if (pod.status?.phase === 'Succeeded') {
        status = 'STOPPED';
      }

      // Get resource usage (simplified - in production use metrics-server)
      const cpuUsage = this.extractCpuUsage(pod);
      const memoryUsage = this.extractMemoryUsage(pod);

      return {
        status,
        podName,
        serviceName: environment.kubernetesServiceName || '',
        namespace,
        cpuUsage,
        memoryUsage,
      };
    } catch (error) {
      logger.error('Failed to get environment info from Kubernetes', { environmentId, error });
      return { status: 'ERROR', namespace: 'unknown' };
    }
  }

  /**
   * Start an environment (if stopped)
   */
  async startEnvironment(environmentId: string): Promise<void> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
        },
      });

      if (!environment?.kubernetesNamespace || !environment?.kubernetesPodName) {
        throw new Error('Environment not deployed to Kubernetes');
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      
      // For simplicity, we'll restart the pod by deleting it
      // Kubernetes will recreate it automatically if it's managed by a deployment
      await client.coreV1Api.deleteNamespacedPod(
        environment.kubernetesPodName,
        environment.kubernetesNamespace
      );

      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'RUNNING' },
      });

      logger.info('Environment start initiated', { environmentId });
    } catch (error) {
      logger.error('Failed to start environment', { environmentId, error });
      throw new KubernetesError('Failed to start environment');
    }
  }

  /**
   * Stop an environment
   */
  async stopEnvironment(environmentId: string): Promise<void> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
        },
      });

      if (!environment?.kubernetesNamespace || !environment?.kubernetesPodName) {
        throw new Error('Environment not deployed to Kubernetes');
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      
      // Scale down by deleting the pod
      await client.coreV1Api.deleteNamespacedPod(
        environment.kubernetesPodName,
        environment.kubernetesNamespace
      );

      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'STOPPING' },
      });

      logger.info('Environment stop initiated', { environmentId });
    } catch (error) {
      logger.error('Failed to stop environment', { environmentId, error });
      throw new KubernetesError('Failed to stop environment');
    }
  }

  /**
   * Delete an environment from Kubernetes
   */
  async deleteEnvironment(environmentId: string): Promise<void> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
          kubernetesServiceName: true,
        },
      });

      if (!environment?.kubernetesNamespace) {
        logger.warn('Environment not deployed to Kubernetes', { environmentId });
        return;
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      const { kubernetesNamespace: namespace } = environment;

      // Delete all resources associated with this environment
      const resourceCleanup = [];

      if (environment.kubernetesPodName) {
        resourceCleanup.push(
          client.coreV1Api.deleteNamespacedPod(environment.kubernetesPodName, namespace)
            .catch((err: any) => logger.warn('Failed to delete pod', { pod: environment.kubernetesPodName, err }))
        );
      }

      if (environment.kubernetesServiceName) {
        resourceCleanup.push(
          client.coreV1Api.deleteNamespacedService(environment.kubernetesServiceName, namespace)
            .catch((err: any) => logger.warn('Failed to delete service', { service: environment.kubernetesServiceName, err }))
        );
      }

      // Delete PVC and ConfigMap
      const pvcName = `pvc-${environmentId}`;
      const configMapName = `config-${environmentId}`;

      resourceCleanup.push(
        client.coreV1Api.deleteNamespacedPersistentVolumeClaim(pvcName, namespace)
          .catch((err: any) => logger.warn('Failed to delete PVC', { pvc: pvcName, err })),
        client.coreV1Api.deleteNamespacedConfigMap(configMapName, namespace)
          .catch((err: any) => logger.warn('Failed to delete ConfigMap', { configMap: configMapName, err }))
      );

      await Promise.allSettled(resourceCleanup);

      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'TERMINATED' },
      });

      logger.info('Environment deleted from Kubernetes', { environmentId });
    } catch (error) {
      logger.error('Failed to delete environment from Kubernetes', { environmentId, error });
      throw new KubernetesError('Failed to delete environment');
    }
  }

  /**
   * Execute command in environment pod (for terminal integration)
   */
  async executeCommand(
    environmentId: string,
    command: string,
    stdin?: boolean
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
        },
      });

      if (!environment?.kubernetesNamespace || !environment?.kubernetesPodName) {
        return { success: false, error: 'Environment not deployed' };
      }

      const kc = this.kubeConfigs.get(environment.clusterId);
      if (!kc) {
        return { success: false, error: 'Cluster not available' };
      }

      const exec = new Exec(kc);
      
      return new Promise((resolve) => {
        let output = '';
        let error = '';

        exec.exec(
          environment.kubernetesNamespace!,
          environment.kubernetesPodName!,
          'devpocket', // container name
          ['/bin/bash', '-c', command],
          process.stdout,
          process.stderr,
          stdin ? process.stdin : null,
          true, // tty
          (status: any) => {
            resolve({
              success: status.status === 'Success',
              output: output || '',
              error: error || '',
            });
          }
        );
      });
    } catch (error) {
      logger.error('Failed to execute command in environment', { environmentId, command, error });
      return { success: false, error: 'Failed to execute command' };
    }
  }

  /**
   * Get environment logs
   */
  async getEnvironmentLogs(
    environmentId: string,
    lines: number = 100,
    follow: boolean = false
  ): Promise<string> {
    try {
      const environment = await prisma.environment.findUnique({
        where: { id: environmentId },
        select: {
          clusterId: true,
          kubernetesNamespace: true,
          kubernetesPodName: true,
        },
      });

      if (!environment?.kubernetesNamespace || !environment?.kubernetesPodName) {
        return 'Environment not deployed to Kubernetes';
      }

      const client = await this.getKubernetesClient(environment.clusterId);
      
      const logsResponse = await client.coreV1Api.readNamespacedPodLog(
        environment.kubernetesPodName,
        environment.kubernetesNamespace,
        'devpocket', // container name
        follow,
        undefined, // limitBytes
        undefined, // pretty
        undefined, // previous
        undefined, // sinceSeconds
        lines,
        undefined  // timestamps
      );

      return logsResponse.body;
    } catch (error) {
      logger.error('Failed to get environment logs', { environmentId, error });
      return `Error retrieving logs: ${error}`;
    }
  }

  // Private helper methods

  private async ensureNamespace(client: KubernetesClient, namespace: string): Promise<void> {
    try {
      await client.coreV1Api.readNamespace(namespace);
    } catch (error) {
      // Namespace doesn't exist, create it
      const namespaceObject = {
        metadata: {
          name: namespace,
          labels: {
            'app.kubernetes.io/name': 'devpocket',
            'app.kubernetes.io/part-of': 'devpocket-environments',
          },
        },
      };

      await client.coreV1Api.createNamespace(namespaceObject);
      logger.info('Namespace created', { namespace });
    }
  }

  private async createPersistentVolumeClaim(
    client: KubernetesClient,
    namespace: string,
    pvcName: string,
    storageSize: string
  ): Promise<void> {
    const pvc: V1PersistentVolumeClaim = {
      metadata: {
        name: pvcName,
        namespace,
        labels: {
          'app.kubernetes.io/name': 'devpocket',
          'app.kubernetes.io/component': 'storage',
        },
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: {
            storage: storageSize,
          },
        },
        // storageClassName: 'standard', // Adjust based on cluster
      },
    };

    await client.coreV1Api.createNamespacedPersistentVolumeClaim(namespace, pvc);
    logger.debug('PVC created', { namespace, pvcName, storageSize });
  }

  private async createConfigMap(
    client: KubernetesClient,
    namespace: string,
    configMapName: string,
    startupCommands: string[]
  ): Promise<void> {
    const startupScript = [
      '#!/bin/bash',
      'set -e',
      '',
      '# Create user and workspace',
      'useradd -m -s /bin/bash devpocket || true',
      'mkdir -p /home/devpocket/.tmux',
      'chown -R devpocket:devpocket /home/devpocket',
      '',
      '# Install tmux if not present',
      'which tmux || (apt-get update && apt-get install -y tmux)',
      '',
      '# Run startup commands',
      ...startupCommands.map(cmd => `echo "Running: ${cmd}" && ${cmd}`),
      '',
      '# Start tmux session',
      'su - devpocket -c "tmux new-session -d -s main"',
      '',
      '# Keep container running',
      'tail -f /dev/null',
    ].join('\n');

    const configMap: V1ConfigMap = {
      metadata: {
        name: configMapName,
        namespace,
        labels: {
          'app.kubernetes.io/name': 'devpocket',
          'app.kubernetes.io/component': 'config',
        },
      },
      data: {
        'startup.sh': startupScript,
      },
    };

    await client.coreV1Api.createNamespacedConfigMap(namespace, configMap);
    logger.debug('ConfigMap created', { namespace, configMapName });
  }

  private async createPod(
    client: KubernetesClient,
    namespace: string,
    options: {
      podName: string;
      dockerImage: string;
      port: number;
      resources: { cpu: string; memory: string; storage: string };
      environmentVariables: Record<string, string>;
      pvcName: string;
      configMapName: string;
    }
  ): Promise<V1Pod> {
    const { podName, dockerImage, port, resources, environmentVariables, pvcName, configMapName } = options;

    const pod: V1Pod = {
      metadata: {
        name: podName,
        namespace,
        labels: {
          'app.kubernetes.io/name': 'devpocket',
          'app.kubernetes.io/component': 'environment',
          'devpocket.io/environment': podName,
        },
      },
      spec: {
        containers: [
          {
            name: 'devpocket',
            image: dockerImage,
            command: ['/bin/bash', '/config/startup.sh'],
            ports: [
              {
                containerPort: port,
                name: 'app-port',
              },
              {
                containerPort: 22,
                name: 'ssh',
              },
            ],
            env: Object.entries(environmentVariables).map(([name, value]) => ({
              name,
              value,
            })),
            resources: {
              requests: {
                cpu: resources.cpu,
                memory: resources.memory,
              },
              limits: {
                cpu: resources.cpu,
                memory: resources.memory,
              },
            },
            volumeMounts: [
              {
                name: 'workspace',
                mountPath: '/home/devpocket/workspace',
              },
              {
                name: 'tmux-data',
                mountPath: '/home/devpocket/.tmux',
              },
              {
                name: 'startup-config',
                mountPath: '/config',
              },
            ],
            securityContext: {
              runAsUser: 0, // Start as root, then switch to devpocket user
              allowPrivilegeEscalation: true,
            },
          },
        ],
        volumes: [
          {
            name: 'workspace',
            persistentVolumeClaim: {
              claimName: pvcName,
            },
          },
          {
            name: 'tmux-data',
            persistentVolumeClaim: {
              claimName: pvcName,
            },
          },
          {
            name: 'startup-config',
            configMap: {
              name: configMapName,
              defaultMode: 0o755,
            },
          },
        ],
        restartPolicy: 'Always',
      },
    };

    const response = await client.coreV1Api.createNamespacedPod(namespace, pod);
    logger.debug('Pod created', { namespace, podName, dockerImage });
    return response.body;
  }

  private async createService(
    client: KubernetesClient,
    namespace: string,
    serviceName: string,
    podName: string,
    port: number
  ): Promise<V1Service> {
    const service: V1Service = {
      metadata: {
        name: serviceName,
        namespace,
        labels: {
          'app.kubernetes.io/name': 'devpocket',
          'app.kubernetes.io/component': 'service',
        },
      },
      spec: {
        selector: {
          'devpocket.io/environment': podName,
        },
        ports: [
          {
            port,
            targetPort: port,
            name: 'app-port',
          },
          {
            port: 22,
            targetPort: 22,
            name: 'ssh',
          },
        ],
        type: 'ClusterIP',
      },
    };

    const response = await client.coreV1Api.createNamespacedService(namespace, service);
    logger.debug('Service created', { namespace, serviceName, port });
    return response.body;
  }

  private extractCpuUsage(_pod: V1Pod): number {
    // In a real implementation, this would come from metrics-server
    // For now, return a mock value
    return Math.random() * 100;
  }

  private extractMemoryUsage(_pod: V1Pod): number {
    // In a real implementation, this would come from metrics-server
    // For now, return a mock value
    return Math.random() * 100;
  }
}

export const kubernetesService = new KubernetesService();
export default kubernetesService;
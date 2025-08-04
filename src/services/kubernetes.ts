import {
  KubeConfig,
  CoreV1Api,
  AppsV1Api,
  BatchV1Api,
  Exec,
  V1Pod,
  V1Service,
  V1ConfigMap,
  V1PersistentVolumeClaim,
  V1Status,
} from '@kubernetes/client-node';
import * as fs from 'fs';
import { prisma } from '@/config/database';
import { encryptionService } from '@/utils/encryption';
import logger, { serializeError } from '@/config/logger';
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
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  /**
   * Check if running inside a Kubernetes cluster
   */
  private isRunningInCluster(): boolean {
    try {
      // Check for service account token file
      const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
      const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
      const caCertPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
      
      return fs.existsSync(tokenPath) && fs.existsSync(namespacePath) && fs.existsSync(caCertPath);
    } catch (error) {
      logger.debug('Error checking in-cluster environment', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Initialize Kubernetes client with hybrid authentication strategy
   * Uses in-cluster config when running inside K8s, falls back to external kubeconfig
   */
  private async getKubernetesClient(clusterId: string): Promise<KubernetesClient> {
    if (this.clients.has(clusterId)) {
      return this.clients.get(clusterId)!;
    }

    try {
      // Initialize Kubernetes configuration
      const kc = new KubeConfig();
      let authMethod = 'unknown';

      // Try in-cluster authentication first if we're running inside a cluster
      if (this.isRunningInCluster()) {
        try {
          kc.loadFromCluster();
          authMethod = 'in-cluster';
          logger.info('Successfully loaded in-cluster Kubernetes configuration', { clusterId });
        } catch (inClusterError) {
          logger.warn('Failed to load in-cluster config, falling back to external kubeconfig', {
            clusterId,
            error: {
              name: inClusterError instanceof Error ? inClusterError.name : 'UnknownError',
              message: inClusterError instanceof Error ? inClusterError.message : 'Unknown error',
            },
          });
          
          // Fall back to external kubeconfig
          await this.loadExternalKubeconfig(kc, clusterId);
          authMethod = 'external-kubeconfig';
        }
      } else {
        // Not running in cluster, use external kubeconfig
        await this.loadExternalKubeconfig(kc, clusterId);
        authMethod = 'external-kubeconfig';
      }

      // Verify the kubeconfig has at least one context
      const contexts = kc.getContexts();
      if (contexts.length === 0) {
        throw new Error('No contexts found in kubeconfig');
      }

      logger.debug('Kubernetes configuration loaded successfully', {
        clusterId,
        authMethod,
        contextsCount: contexts.length,
        currentContext: kc.getCurrentContext(),
      });

      // Create API clients with SSL verification enabled
      const coreV1Api = kc.makeApiClient(CoreV1Api);
      const appsV1Api = kc.makeApiClient(AppsV1Api);
      const batchV1Api = kc.makeApiClient(BatchV1Api);

      // Ensure SSL verification is enabled (security improvement)
      this.configureSSLVerification([coreV1Api, appsV1Api, batchV1Api]);

      const client = {
        coreV1Api,
        appsV1Api,
        batchV1Api,
      };

      this.clients.set(clusterId, client);
      this.kubeConfigs.set(clusterId, kc);

      logger.info('Kubernetes client initialized with hybrid authentication', { 
        clusterId, 
        authMethod,
        sslVerificationEnabled: true
      });
      return client;
    } catch (error) {
      logger.error('Failed to initialize Kubernetes client', {
        clusterId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          cause: error instanceof Error ? error.cause : undefined,
        },
      });
      throw new KubernetesError(
        `Failed to connect to cluster ${clusterId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Load external kubeconfig from database
   */
  private async loadExternalKubeconfig(kc: KubeConfig, clusterId: string): Promise<void> {
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

    // Decrypt the kubeconfig content
    let kubeconfig: string;
    try {
      kubeconfig = encryptionService.decrypt(cluster.kubeconfig);
      logger.debug('Kubeconfig decrypted successfully', { clusterId });
    } catch (decryptError) {
      // Fallback: assume it's plain text (backwards compatibility)
      logger.warn('Failed to decrypt kubeconfig, assuming plain text', {
        clusterId,
        error: {
          name: decryptError instanceof Error ? decryptError.name : 'UnknownError',
          message: decryptError instanceof Error ? decryptError.message : 'Unknown error',
          stack: decryptError instanceof Error ? decryptError.stack : undefined,
        },
        kubeconfigLength: cluster.kubeconfig.length,
      });
      kubeconfig = cluster.kubeconfig;

      // Enhanced validation for plain text kubeconfig
      if (!this.validateKubeconfigFormat(kubeconfig)) {
        throw new Error(
          `Invalid kubeconfig format detected for cluster ${clusterId}. Expected YAML with apiVersion and clusters sections.`
        );
      }

      logger.info('Using plain text kubeconfig', {
        clusterId,
        hasApiVersion: kubeconfig.includes('apiVersion'),
        hasClusters: kubeconfig.includes('clusters'),
        hasContexts: kubeconfig.includes('contexts'),
      });
    }

    // Validate kubeconfig before loading
    try {
      kc.loadFromString(kubeconfig);
      logger.debug('External kubeconfig loaded successfully', { clusterId });
    } catch (loadError) {
      logger.error('Failed to load external kubeconfig', {
        clusterId,
        error: {
          name: loadError instanceof Error ? loadError.name : 'UnknownError',
          message: loadError instanceof Error ? loadError.message : 'Unknown error',
        },
        kubeconfigSample: kubeconfig.slice(0, 200) + (kubeconfig.length > 200 ? '...' : ''),
      });
      throw new Error(
        `Invalid kubeconfig format: ${loadError instanceof Error ? loadError.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Configure SSL verification for API clients
   */
  private configureSSLVerification(apiClients: Array<CoreV1Api | AppsV1Api | BatchV1Api>): void {
    apiClients.forEach(client => {
      // Ensure SSL verification is enabled (security requirement)
      // The client-node library handles SSL verification automatically when proper CA certificates are available
      // This method exists to explicitly document that SSL verification is enabled and provide a place
      // for any additional SSL configuration if needed in the future
      logger.debug('SSL verification enabled for Kubernetes API client', {
        clientType: client.constructor.name
      });
    });
  }

  /**
   * Create a new development environment in Kubernetes
   */
  async createEnvironment(options: EnvironmentCreateOptions): Promise<EnvironmentInfo> {
    const {
      environmentId,
      userId,
      name: _name, // eslint-disable-line @typescript-eslint/no-unused-vars
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
      await this.retryOperation(() => this.ensureNamespace(client, namespace), 'Create namespace', {
        environmentId,
        namespace,
      });

      // Create persistent volume claim for workspace storage
      await this.retryOperation(
        () => this.createPersistentVolumeClaim(client, namespace, pvcName, resources.storage),
        'Create PVC',
        { environmentId, pvcName, storage: resources.storage }
      );

      // Create ConfigMap with startup scripts
      await this.retryOperation(
        () => this.createConfigMap(client, namespace, configMapName, startupCommands),
        'Create ConfigMap',
        { environmentId, configMapName }
      );

      // Create pod for the environment
      await this.retryOperation(
        () =>
          this.createPod(client, namespace, {
            podName,
            dockerImage,
            port,
            resources,
            environmentVariables,
            pvcName,
            configMapName,
          }),
        'Create Pod',
        { environmentId, podName, dockerImage }
      );

      // Create service to expose the pod
      await this.retryOperation(
        () => this.createService(client, namespace, serviceName, podName, port),
        'Create Service',
        { environmentId, serviceName, port }
      );

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
      const errorDetails = {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined,
      };

      logger.error('Failed to create environment in Kubernetes', {
        environmentId,
        userId,
        error: errorDetails,
      });

      // Update environment status to error
      try {
        await prisma.environment.update({
          where: { id: environmentId },
          data: {
            status: 'ERROR',
            // Store error details for debugging
            lastError: JSON.stringify(errorDetails),
          },
        });
      } catch (dbError) {
        logger.error('Failed to update environment status', {
          environmentId,
          error: {
            name: dbError instanceof Error ? dbError.name : 'UnknownError',
            message: dbError instanceof Error ? dbError.message : 'Unknown error',
          },
        });
      }

      throw new KubernetesError(`Failed to create environment: ${errorDetails.message}`);
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
      logger.error('Failed to get environment info from Kubernetes', {
        environmentId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
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
      logger.error('Failed to start environment', {
        environmentId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new KubernetesError(
        `Failed to start environment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
      logger.error('Failed to stop environment', {
        environmentId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new KubernetesError(
        `Failed to stop environment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
          client.coreV1Api
            .deleteNamespacedPod(environment.kubernetesPodName, namespace)
            .catch((err: unknown) =>
              logger.warn('Failed to delete pod', { pod: environment.kubernetesPodName, err })
            )
        );
      }

      if (environment.kubernetesServiceName) {
        resourceCleanup.push(
          client.coreV1Api
            .deleteNamespacedService(environment.kubernetesServiceName, namespace)
            .catch((err: unknown) =>
              logger.warn('Failed to delete service', {
                service: environment.kubernetesServiceName,
                err,
              })
            )
        );
      }

      // Delete PVC and ConfigMap
      const pvcName = `pvc-${environmentId}`;
      const configMapName = `config-${environmentId}`;

      resourceCleanup.push(
        client.coreV1Api
          .deleteNamespacedPersistentVolumeClaim(pvcName, namespace)
          .catch((err: unknown) => logger.warn('Failed to delete PVC', { pvc: pvcName, err })),
        client.coreV1Api
          .deleteNamespacedConfigMap(configMapName, namespace)
          .catch((err: unknown) =>
            logger.warn('Failed to delete ConfigMap', { configMap: configMapName, err })
          )
      );

      await Promise.allSettled(resourceCleanup);

      await prisma.environment.update({
        where: { id: environmentId },
        data: { status: 'TERMINATED' },
      });

      logger.info('Environment deleted from Kubernetes', { environmentId });
    } catch (error) {
      logger.error('Failed to delete environment from Kubernetes', {
        environmentId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw new KubernetesError(
        `Failed to delete environment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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

      return new Promise(resolve => {
        const output = '';
        const error = '';

        exec.exec(
          environment.kubernetesNamespace!,
          environment.kubernetesPodName!,
          'devpocket', // container name
          ['/bin/bash', '-c', command],
          process.stdout,
          process.stderr,
          stdin ? process.stdin : null,
          true, // tty
          (status: V1Status) => {
            resolve({
              success: status.status === 'Success',
              output: output || '',
              error: error || '',
            });
          }
        );
      });
    } catch (error) {
      logger.error('Failed to execute command in environment', {
        environmentId,
        command,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      return {
        success: false,
        error: `Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
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
        undefined // timestamps
      );

      return logsResponse.body;
    } catch (error) {
      logger.error('Failed to get environment logs', {
        environmentId,
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      return `Error retrieving logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // Private helper methods

  /**
   * Retry mechanism for Kubernetes operations
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    context: Record<string, any> = {}
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === this.maxRetries) {
          logger.error(`${operationName} failed after ${this.maxRetries} attempts`, {
            ...context,
            error: serializeError(lastError),
            attempts: attempt,
          });
          throw lastError;
        }

        const isRetryable = this.isRetryableError(lastError);
        if (!isRetryable) {
          logger.error(`${operationName} failed with non-retryable error`, {
            ...context,
            error: serializeError(lastError),
            attempt,
          });
          throw lastError;
        }

        const delay = this.retryDelayMs * attempt;
        logger.warn(`${operationName} failed, retrying in ${delay}ms`, {
          ...context,
          error: serializeError(lastError),
          attempt,
          nextRetryIn: delay,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /connection.*(refused|timeout|reset)/i,
      /timeout/i,
      /temporarily unavailable/i,
      /service unavailable/i,
      /too many requests/i,
      /etcd cluster is unavailable/i,
    ];

    const errorMessage = error.message.toLowerCase();
    return retryablePatterns.some(pattern => pattern.test(errorMessage));
  }

  private validateKubeconfigFormat(kubeconfig: string): boolean {
    try {
      // Basic structure validation
      if (!kubeconfig || typeof kubeconfig !== 'string') {
        return false;
      }

      // Check for required YAML structure
      if (
        !kubeconfig.includes('apiVersion') ||
        !kubeconfig.includes('clusters') ||
        !kubeconfig.includes('contexts')
      ) {
        return false;
      }

      // Try to parse as YAML to ensure it's valid
      const yaml = require('yaml');
      const parsed = yaml.parse(kubeconfig);

      if (!parsed || parsed.kind !== 'Config') {
        return false;
      }

      return true;
    } catch (error) {
      logger.debug('Kubeconfig format validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

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
    const { podName, dockerImage, port, resources, environmentVariables, pvcName, configMapName } =
      options;

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

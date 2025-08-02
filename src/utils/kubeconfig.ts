import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { KubeConfig } from '@kubernetes/client-node';
import logger from '@/config/logger';

interface ClusterInfo {
  name: string;
  server: string;
  certificateAuthorityData?: string;
  insecureSkipTlsVerify?: boolean;
}

interface UserInfo {
  name: string;
  clientCertificateData?: string;
  clientKeyData?: string;
  token?: string;
  username?: string;
  password?: string;
}

interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
}

interface KubeconfigData {
  apiVersion: string;
  kind: string;
  clusters: Array<{
    name: string;
    cluster: ClusterInfo;
  }>;
  users: Array<{
    name: string;
    user: UserInfo;
  }>;
  contexts: Array<{
    name: string;
    context: ContextInfo;
  }>;
  currentContext?: string;
  preferences?: any;
}

interface ParsedClusterData {
  name: string;
  description: string;
  provider: string;
  region: string;
  server: string;
  kubeconfig: string;
  certificateAuthority?: string;
  clientCertificate?: string;
  clientKey?: string;
  token?: string;
  username?: string;
  password?: string;
  namespace?: string;
  isCurrentContext: boolean;
}

class KubeconfigService {
  /**
   * Parse kubeconfig file and extract cluster information
   */
  async parseKubeconfigFile(filePath: string): Promise<ParsedClusterData[]> {
    try {
      const absolutePath = path.resolve(filePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Kubeconfig file not found: ${absolutePath}`);
      }

      const kubeconfigContent = fs.readFileSync(absolutePath, 'utf8');
      return this.parseKubeconfigContent(kubeconfigContent);
    } catch (error) {
      logger.error('Failed to parse kubeconfig file', { filePath, error });
      throw error;
    }
  }

  /**
   * Parse kubeconfig content from string
   */
  parseKubeconfigContent(content: string): ParsedClusterData[] {
    try {
      const kubeconfigData: KubeconfigData = yaml.parse(content);
      
      if (!kubeconfigData || kubeconfigData.kind !== 'Config') {
        throw new Error('Invalid kubeconfig format');
      }

      const clusters: ParsedClusterData[] = [];

      // Process each context to create cluster entries
      for (const contextEntry of kubeconfigData.contexts || []) {
        const context = contextEntry.context;
        const clusterEntry = kubeconfigData.clusters?.find(c => c.name === context.cluster);
        const userEntry = kubeconfigData.users?.find(u => u.name === context.user);

        if (!clusterEntry || !userEntry) {
          logger.warn('Incomplete context configuration', { 
            context: contextEntry.name,
            cluster: context.cluster,
            user: context.user 
          });
          continue;
        }

        const cluster = clusterEntry.cluster;
        const user = userEntry.user;

        // Extract region from server URL or use default
        const region = this.extractRegionFromServer(cluster.server);
        
        // Extract provider from cluster name or server
        const provider = this.extractProviderFromCluster(clusterEntry.name, cluster.server);

        const parsedCluster: ParsedClusterData = {
          name: contextEntry.name,
          description: `Kubernetes cluster: ${contextEntry.name}`,
          provider,
          region,
          server: cluster.server,
          kubeconfig: content, // Store the full kubeconfig
          certificateAuthority: cluster.certificateAuthorityData,
          clientCertificate: user.clientCertificateData,
          clientKey: user.clientKeyData,
          token: user.token,
          username: user.username,
          password: user.password,
          namespace: context.namespace || 'default',
          isCurrentContext: contextEntry.name === kubeconfigData.currentContext,
        };

        clusters.push(parsedCluster);
      }

      logger.info('Kubeconfig parsed successfully', { 
        clustersFound: clusters.length,
        currentContext: kubeconfigData.currentContext 
      });

      return clusters;
    } catch (error) {
      logger.error('Failed to parse kubeconfig content', { error });
      throw new Error(`Invalid kubeconfig format: ${error}`);
    }
  }

  /**
   * Validate kubeconfig connectivity
   */
  async validateKubeconfigConnectivity(content: string): Promise<{
    valid: boolean;
    clusters: Array<{
      name: string;
      connected: boolean;
      error?: string;
      version?: string;
      nodeCount?: number;
    }>;
  }> {
    try {
      const kc = new KubeConfig();
      kc.loadFromString(content);

      const clusters = [];
      const contexts = kc.getContexts();

      for (const context of contexts) {
        try {
          // Set current context
          kc.setCurrentContext(context.name);
          
          // Create API client
          const { CoreV1Api } = require('@kubernetes/client-node');
          const coreV1Api = kc.makeApiClient(CoreV1Api);
          
          // Test connectivity with a simple API call
          // Try to list namespaces (should work with basic permissions)
          const namespacesResponse = await coreV1Api.listNamespace();
          
          // Try to get node count (may fail if no permissions, but that's ok)
          let nodeCount = 0;
          try {
            const nodesResponse = await coreV1Api.listNode();
            nodeCount = nodesResponse.body.items?.length || 0;
          } catch (nodeError) {
            // If we can't list nodes, assume cluster is still working but with limited permissions
            logger.debug('Cannot list nodes, possibly due to permissions', { context: context.name });
            nodeCount = 1; // Default assumption
          }

          clusters.push({
            name: context.name,
            connected: true,
            version: 'v1',
            nodeCount,
          });

          logger.info('Cluster connectivity validated', { 
            context: context.name,
            nodeCount,
            namespaces: namespacesResponse.body.items?.length || 0
          });
        } catch (error) {
          logger.warn('Cluster connectivity failed', { 
            context: context.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          
          clusters.push({
            name: context.name,
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const allConnected = clusters.every(c => c.connected);
      
      return {
        valid: allConnected,
        clusters,
      };
    } catch (error) {
      logger.error('Kubeconfig validation failed', { error });
      return {
        valid: false,
        clusters: [{
          name: 'unknown',
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }],
      };
    }
  }

  /**
   * Extract region from server URL
   */
  private extractRegionFromServer(server: string): string {
    try {
      const url = new URL(server);
      const hostname = url.hostname;
      
      // Extract from IP ranges first (more reliable for OVH)
      if (hostname.startsWith('51.79.')) {
        return 'eu-west-1'; // OVH Europe
      }
      if (hostname.startsWith('51.178.')) {
        return 'eu-central-1'; // OVH Germany
      }
      if (hostname.startsWith('54.') || hostname.startsWith('3.')) {
        return 'us-east-1'; // AWS default
      }
      if (hostname.startsWith('35.') || hostname.startsWith('34.')) {
        return 'us-central1'; // GCP default
      }

      // Common patterns for extracting region from hostname (for cloud providers)
      const regionPatterns = [
        /(\w+-\w+-\d+)\./, // AWS style: us-west-1
        /([a-z]+\d+)\./, // Simple style: us1, eu1 (only letters followed by numbers)
        /\.(\w+-\w+)\./, // Middle position: .us-west.
      ];

      for (const pattern of regionPatterns) {
        const match = hostname.match(pattern);
        if (match && !match[1].match(/^\d/)) { // Don't match if it starts with a digit
          return match[1];
        }
      }
      
      return 'eu-west-1'; // Default to Europe
    } catch {
      return 'eu-west-1'; // Default fallback
    }
  }

  /**
   * Extract provider from cluster name or server
   */
  private extractProviderFromCluster(clusterName: string, server: string): string {
    const name = clusterName.toLowerCase();
    const serverLower = server.toLowerCase();

    // Common provider patterns
    if (name.includes('ovh') || serverLower.includes('ovh') || server.includes('51.79.')) {
      return 'ovh';
    }
    if (name.includes('aws') || serverLower.includes('eks') || serverLower.includes('amazonaws')) {
      return 'aws';
    }
    if (name.includes('gcp') || name.includes('gke') || serverLower.includes('googleapis')) {
      return 'gcp';
    }
    if (name.includes('azure') || name.includes('aks') || serverLower.includes('azure')) {
      return 'azure';
    }
    if (name.includes('digitalocean') || name.includes('do') || serverLower.includes('digitalocean')) {
      return 'digitalocean';
    }
    if (name.includes('linode') || serverLower.includes('linode')) {
      return 'linode';
    }

    return 'kubernetes'; // Generic provider
  }

  /**
   * Create a minimal kubeconfig for a specific context
   */
  createContextKubeconfig(fullKubeconfig: string, contextName: string): string {
    try {
      const kubeconfigData: KubeconfigData = yaml.parse(fullKubeconfig);
      
      const context = kubeconfigData.contexts?.find(c => c.name === contextName);
      if (!context) {
        throw new Error(`Context ${contextName} not found`);
      }

      const cluster = kubeconfigData.clusters?.find(c => c.name === context.context.cluster);
      const user = kubeconfigData.users?.find(u => u.name === context.context.user);

      if (!cluster || !user) {
        throw new Error(`Incomplete configuration for context ${contextName}`);
      }

      const minimalConfig: KubeconfigData = {
        apiVersion: kubeconfigData.apiVersion,
        kind: kubeconfigData.kind,
        clusters: [cluster],
        users: [user],
        contexts: [context],
        currentContext: contextName,
        preferences: kubeconfigData.preferences || {},
      };

      return yaml.stringify(minimalConfig);
    } catch (error) {
      logger.error('Failed to create context kubeconfig', { contextName, error });
      throw error;
    }
  }
}

export const kubeconfigService = new KubeconfigService();
export default kubeconfigService;
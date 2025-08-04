/**
 * Multi-Environment Consistency and Isolation Tests
 * 
 * Tests validate:
 * - Environment isolation (namespace separation)
 * - Domain routing configuration per environment  
 * - Resource allocation per environment
 * - Secret management isolation
 * - Configuration consistency across environments
 * - Environment-specific deployment parameters
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Multi-Environment Consistency and Isolation Tests', () => {
  const environments = [
    {
      name: 'dev',
      namespace: 'devpocket-dev',
      domain: 'api.dev.devpocket.app',
      nodeEnv: 'development',
      logLevel: 'debug',
      debug: 'true',
      replicas: 1,
      memoryRequest: '128Mi',
      memoryLimit: '256Mi',
      cpuRequest: '100m',
      cpuLimit: '300m',
      workflow: 'deploy-dev.yml',
      branch: 'dev/*',
      kubeconfig: 'KUBECONFIG_DEV'
    },
    {
      name: 'beta',
      namespace: 'devpocket-beta',
      domain: 'api.beta.devpocket.app',
      nodeEnv: 'beta',
      logLevel: 'debug',
      debug: 'true',
      replicas: 1,
      memoryRequest: '256Mi',
      memoryLimit: '512Mi',
      cpuRequest: '200m',
      cpuLimit: '500m',
      workflow: 'deploy-beta.yml',
      branch: 'beta',
      kubeconfig: 'KUBECONFIG_BETA'
    },
    {
      name: 'production',
      namespace: 'devpocket-prod',
      domain: 'api.devpocket.app',
      nodeEnv: 'production',
      logLevel: 'info',
      debug: 'false',
      replicas: 2,
      memoryRequest: '256Mi',
      memoryLimit: '512Mi',
      cpuRequest: '200m',
      cpuLimit: '500m',
      workflow: 'deploy-production.yml',
      branch: 'main',
      kubeconfig: 'KUBECONFIG'
    }
  ];

  describe('Namespace Isolation', () => {
    test('each environment should have unique namespace', () => {
      const namespaces = environments.map(env => env.namespace);
      const uniqueNamespaces = [...new Set(namespaces)];
      expect(uniqueNamespaces).toHaveLength(environments.length);
    });

    test('namespaces should follow consistent naming pattern', () => {
      environments.forEach(env => {
        expect(env.namespace).toMatch(/^devpocket-(dev|beta|prod)$/);
        expect(env.namespace).toContain('devpocket');
      });
    });

    test('workflow manifests should use correct namespaces', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;
          expect(workflow.env.KUBERNETES_NAMESPACE).toBe(env.namespace);
        }
      });
    });
  });

  describe('Domain Routing Configuration', () => {
    test('each environment should have unique domain', () => {
      const domains = environments.map(env => env.domain);
      const uniqueDomains = [...new Set(domains)];
      expect(uniqueDomains).toHaveLength(environments.length);
    });

    test('domains should follow hierarchical pattern', () => {
      expect(environments.find(e => e.name === 'dev')?.domain).toBe('api.dev.devpocket.app');
      expect(environments.find(e => e.name === 'beta')?.domain).toBe('api.beta.devpocket.app');
      expect(environments.find(e => e.name === 'production')?.domain).toBe('api.devpocket.app');
    });

    test('workflows should configure correct domains', () => {
      environments.forEach(env => {
        if (env.name === 'production') return; // Production doesn't set DOMAIN env var explicitly
        
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;
          expect(workflow.env.DOMAIN).toBe(env.domain);
        }
      });
    });

    test('ingress configuration should support environment-specific TLS', () => {
      const k8sIngressPath = path.join(process.cwd(), 'k8s', 'ingress.yaml');
      if (fs.existsSync(k8sIngressPath)) {
        const content = fs.readFileSync(k8sIngressPath, 'utf8');
        
        // Check that workflows modify TLS names appropriately
        environments.forEach(env => {
          const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
          if (fs.existsSync(workflowPath)) {
            const workflowContent = fs.readFileSync(workflowPath, 'utf8');
            
            if (env.name === 'dev') {
              expect(workflowContent).toContain('tls-api-dev-devpocket-app');
              expect(workflowContent).toContain('tls-devpocket-nodejs-dev-diginext-site');
            } else if (env.name === 'beta') {
              expect(workflowContent).toContain('tls-api-beta-devpocket-app');
              expect(workflowContent).toContain('tls-devpocket-nodejs-beta-diginext-site');
            }
          }
        });
      }
    });
  });

  describe('Resource Allocation per Environment', () => {
    test('development should have reduced resource requirements', () => {
      const devEnv = environments.find(e => e.name === 'dev')!;
      const betaEnv = environments.find(e => e.name === 'beta')!;
      
      expect(devEnv.memoryRequest).toBe('128Mi');
      expect(betaEnv.memoryRequest).toBe('256Mi');
      expect(devEnv.cpuRequest).toBe('100m');
      expect(betaEnv.cpuRequest).toBe('200m');
    });

    test('production should have highest replica count', () => {
      const prodEnv = environments.find(e => e.name === 'production')!;
      const devEnv = environments.find(e => e.name === 'dev')!;
      const betaEnv = environments.find(e => e.name === 'beta')!;
      
      expect(prodEnv.replicas).toBeGreaterThan(devEnv.replicas);
      expect(prodEnv.replicas).toBeGreaterThanOrEqual(betaEnv.replicas);
    });

    test('workflows should apply environment-specific resource limits', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          
          if (env.name === 'dev') {
            expect(content).toContain('memory: "128Mi"');
            expect(content).toContain('cpu: "100m"');
            expect(content).toContain('memory: "256Mi"');
            expect(content).toContain('cpu: "300m"');
          }
        }
      });
    });
  });

  describe('Secret Management Isolation', () => {
    test('each environment should use separate kubeconfig secrets', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain(`secrets.${env.kubeconfig}`);
        }
      });
    });

    test('all environments should share common Docker secrets', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('secrets.DOCKER_USER');
          expect(content).toContain('secrets.DOCKER_PAT');
        }
      });
    });

    test('semantic release workflows should use GitHub and NPM tokens', () => {
      const semanticReleaseEnvs = environments.filter(e => e.name !== 'dev');
      
      semanticReleaseEnvs.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('secrets.GITHUB_TOKEN');
          expect(content).toContain('secrets.NPM_TOKEN');
        }
      });
    });
  });

  describe('Configuration Consistency', () => {
    test('all environments should use same Docker registry and image', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;
          
          expect(workflow.env.DOCKER_REGISTRY).toBe('docker.io');
          expect(workflow.env.DOCKER_IMAGE).toBe('digitop/devpocket-nodejs');
        }
      });
    });

    test('all environments should use same Node.js version', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain("node-version: '20.x'");
        }
      });
    });

    test('all environments should use same pnpm version', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('version: 9.6.0');
        }
      });
    });

    test('all environments should have consistent job structure', () => {
      const expectedJobs = ['test', 'build-and-push', 'deploy', 'notify'];
      
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;
          
          expectedJobs.forEach(job => {
            expect(workflow.jobs[job]).toBeDefined();
          });
          
          // Beta and production should also have semantic-release job
          if (env.name !== 'dev') {
            expect(workflow.jobs['semantic-release']).toBeDefined();
          }
        }
      });
    });
  });

  describe('Environment-Specific Deployment Parameters', () => {
    test('development should have lenient health checks', () => {
      const devWorkflowPath = path.join(process.cwd(), '.github', 'workflows', 'deploy-dev.yml');
      if (fs.existsSync(devWorkflowPath)) {
        const content = fs.readFileSync(devWorkflowPath, 'utf8');
        expect(content).toContain('this is expected for new dev deployments');
        expect(content).not.toContain('exit 1'); // Should not fail on health check
      }
    });

    test('beta and production should have strict health checks', () => {
      const strictEnvs = ['deploy-beta.yml', 'deploy-production.yml'];
      
      strictEnvs.forEach(workflow => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('exit 1'); // Should fail on health check failure
        }
      });
    });

    test('environments should have different logging configurations', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          
          if (env.name === 'dev') {
            expect(content).toContain('value: "development"');
            expect(content).toContain('value: "debug"');
            expect(content).toContain('value: "true"');
          } else if (env.name === 'beta') {
            expect(content).toContain('value: "beta"');
            expect(content).toContain('value: "debug"');
          } else if (env.name === 'production') {
            expect(content).toContain('value: "production"');
          }
        }
      });
    });
  });

  describe('Branch-Based Deployment Strategy', () => {
    test('each environment should trigger on correct branches', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;
          
          expect(workflow.on.push.branches).toContain(env.branch);
        }
      });
    });

    test('environments should have environment protection', () => {
      const envProtections = {
        'deploy-dev.yml': 'development',
        'deploy-beta.yml': 'beta',
        'deploy-production.yml': 'production'
      };

      Object.entries(envProtections).forEach(([workflow, environment]) => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflowObj = yaml.load(content) as any;
          expect(workflowObj.jobs.deploy.environment).toBe(environment);
        }
      });
    });
  });

  describe('Docker Tagging Strategy Consistency', () => {
    test('each environment should have unique tagging strategy', () => {
      const devWorkflow = path.join(process.cwd(), '.github', 'workflows', 'deploy-dev.yml');
      const betaWorkflow = path.join(process.cwd(), '.github', 'workflows', 'deploy-beta.yml');
      const prodWorkflow = path.join(process.cwd(), '.github', 'workflows', 'deploy-production.yml');

      if (fs.existsSync(devWorkflow)) {
        const content = fs.readFileSync(devWorkflow, 'utf8');
        expect(content).toContain('dev-latest');
        expect(content).toContain('dev-${{ env.BRANCH_SAFE }}');
      }

      if (fs.existsSync(betaWorkflow)) {
        const content = fs.readFileSync(betaWorkflow, 'utf8');
        expect(content).toContain('beta-latest');
        expect(content).toContain('beta-${{ github.run_number }}');
      }

      if (fs.existsSync(prodWorkflow)) {
        const content = fs.readFileSync(prodWorkflow, 'utf8');
        expect(content).toContain('latest,enable={{is_default_branch}}');
        expect(content).toContain('main-${{ github.run_number }}');
      }
    });
  });

  describe('Deployment Timing and Dependencies', () => {
    test('all environments should have proper job dependencies', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;

          // Build should depend on test
          expect(workflow.jobs['build-and-push'].needs).toContain('test');
          
          // Deploy should depend on test and build
          expect(workflow.jobs.deploy.needs).toContain('test');
          expect(workflow.jobs.deploy.needs).toContain('build-and-push');
          
          // Notify should depend on all jobs and run always
          expect(workflow.jobs.notify.needs).toContain('test');
          expect(workflow.jobs.notify.needs).toContain('build-and-push');
          expect(workflow.jobs.notify.needs).toContain('deploy');
          expect(workflow.jobs.notify.if).toBe('always()');
        }
      });
    });

    test('semantic release environments should have correct dependency chain', () => {
      const semanticEnvs = ['deploy-beta.yml', 'deploy-production.yml'];
      
      semanticEnvs.forEach(workflow => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflowObj = yaml.load(content) as any;

          expect(workflowObj.jobs['semantic-release'].needs).toContain('test');
          expect(workflowObj.jobs['build-and-push'].needs).toContain('semantic-release');
          expect(workflowObj.jobs.deploy.needs).toContain('semantic-release');
        }
      });
    });
  });

  describe('Rollout and Health Check Configuration', () => {
    test('all environments should wait for deployment readiness', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('kubectl rollout status');
          expect(content).toContain('--timeout=300s');
        }
      });
    });

    test('all environments should verify deployment after rollout', () => {
      environments.forEach(env => {
        const workflowPath = path.join(process.cwd(), '.github', 'workflows', env.workflow);
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          expect(content).toContain('kubectl get pods');
          expect(content).toContain('kubectl get services');
          expect(content).toContain('kubectl get ingress');
        }
      });
    });
  });
});
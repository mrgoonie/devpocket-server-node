/**
 * Kubernetes Manifest Generation and Validation Tests
 *
 * Tests validate:
 * - Template rendering for each environment
 * - Environment-specific values (domains, namespaces, resources)
 * - Generated YAML is valid Kubernetes syntax
 * - Security configurations
 * - Resource limits and requests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Kubernetes Manifest Generation and Validation', () => {
  const k8sDir = path.join(process.cwd(), 'k8s');
  const tempDir = path.join(process.cwd(), 'temp-k8s-test');

  const expectedManifests = ['deployment.yaml', 'service.yaml', 'ingress.yaml', 'namespace.yaml'];

  const environments = [
    {
      name: 'dev',
      namespace: 'devpocket-dev',
      domain: 'api.dev.devpocket.app',
      imageTag: 'dev-latest',
      nodeEnv: 'development',
      logLevel: 'debug',
      debugMode: 'true',
    },
    {
      name: 'beta',
      namespace: 'devpocket-beta',
      domain: 'api.beta.devpocket.app',
      imageTag: 'beta-latest',
      nodeEnv: 'beta',
      logLevel: 'debug',
      debugMode: 'false',
    },
    {
      name: 'production',
      namespace: 'devpocket-prod',
      domain: 'api.devpocket.app',
      imageTag: 'latest',
      nodeEnv: 'production',
      logLevel: 'info',
      debugMode: 'false',
    },
  ];

  beforeAll(async () => {
    // Ensure k8s directory exists
    expect(fs.existsSync(k8sDir)).toBe(true);

    // Create temp directory for generated manifests
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Base Manifest Files Existence', () => {
    expectedManifests.forEach(manifest => {
      test(`${manifest} should exist in k8s directory`, () => {
        const manifestPath = path.join(k8sDir, manifest);
        expect(fs.existsSync(manifestPath)).toBe(true);
      });
    });
  });

  describe('Base Manifest YAML Syntax', () => {
    expectedManifests.forEach(manifest => {
      test(`${manifest} should have valid YAML syntax`, () => {
        const manifestPath = path.join(k8sDir, manifest);
        const content = fs.readFileSync(manifestPath, 'utf8');

        expect(() => {
          yaml.load(content);
        }).not.toThrow();
      });
    });
  });

  describe('Environment-Specific Manifest Generation', () => {
    environments.forEach(env => {
      describe(`${env.name.toUpperCase()} Environment`, () => {
        const envDir = path.join(tempDir, env.name);

        beforeAll(() => {
          if (!fs.existsSync(envDir)) {
            fs.mkdirSync(envDir, { recursive: true });
          }
        });

        test('should generate deployment manifest with correct environment values', () => {
          const sourceFile = path.join(k8sDir, 'deployment.yaml');
          const targetFile = path.join(envDir, 'deployment.yaml');

          // Read and modify deployment for environment
          let content = fs.readFileSync(sourceFile, 'utf8');
          content = content
            .replace(/namespace: devpocket-prod/g, `namespace: ${env.namespace}`)
            .replace(
              /image: docker\.io\/digitop\/devpocket-nodejs:latest/g,
              `image: docker.io/digitop/devpocket-nodejs:${env.imageTag}`
            )
            .replace(/value: "production"/g, `value: "${env.nodeEnv}"`)
            .replace(/value: "info"/g, `value: "${env.logLevel}"`)
            .replace(/value: "false"/g, `value: "${env.debugMode}"`);

          if (env.name === 'dev') {
            // Reduce resources for dev
            content = content
              .replace(/memory: "256Mi"/g, 'memory: "128Mi"')
              .replace(/cpu: "200m"/g, 'cpu: "100m"')
              .replace(/memory: "512Mi"/g, 'memory: "256Mi"')
              .replace(/cpu: "500m"/g, 'cpu: "300m"');
          }

          fs.writeFileSync(targetFile, content);

          // Validate generated content
          const generatedContent = yaml.load(content) as any;
          expect(generatedContent.metadata.namespace).toBe(env.namespace);
          expect(generatedContent.spec.template.spec.containers[0].image).toContain(env.imageTag);

          // Check environment variables
          const envVars = generatedContent.spec.template.spec.containers[0].env;
          const nodeEnvVar = envVars.find((v: any) => v.name === 'NODE_ENV');
          const logLevelVar = envVars.find((v: any) => v.name === 'LOG_LEVEL');

          expect(nodeEnvVar?.value).toBe(env.nodeEnv);
          expect(logLevelVar?.value).toBe(env.logLevel);
        });

        test('should generate service manifest with correct namespace', () => {
          const sourceFile = path.join(k8sDir, 'service.yaml');
          const targetFile = path.join(envDir, 'service.yaml');

          let content = fs.readFileSync(sourceFile, 'utf8');
          content = content.replace(/namespace: devpocket-prod/g, `namespace: ${env.namespace}`);

          fs.writeFileSync(targetFile, content);

          const generatedContent = yaml.load(content) as any;
          expect(generatedContent.metadata.namespace).toBe(env.namespace);
        });

        test('should generate ingress manifest with correct domain and namespace', () => {
          const sourceFile = path.join(k8sDir, 'ingress.yaml');
          const targetFile = path.join(envDir, 'ingress.yaml');

          let content = fs.readFileSync(sourceFile, 'utf8');
          content = content
            .replace(/namespace: devpocket-prod/g, `namespace: ${env.namespace}`)
            .replace(/api\.devpocket\.app/g, env.domain);

          // Update TLS certificate names for different environments
          if (env.name === 'dev') {
            content = content
              .replace(/tls-api-devpocket-app/g, 'tls-api-dev-devpocket-app')
              .replace(
                /devpocket-nodejs\.prod\.diginext\.site/g,
                'devpocket-nodejs.dev.diginext.site'
              )
              .replace(
                /tls-devpocket-nodejs-prod-diginext-site/g,
                'tls-devpocket-nodejs-dev-diginext-site'
              );
          } else if (env.name === 'beta') {
            content = content
              .replace(/tls-api-devpocket-app/g, 'tls-api-beta-devpocket-app')
              .replace(
                /devpocket-nodejs\.prod\.diginext\.site/g,
                'devpocket-nodejs.beta.diginext.site'
              )
              .replace(
                /tls-devpocket-nodejs-prod-diginext-site/g,
                'tls-devpocket-nodejs-beta-diginext-site'
              );
          }

          fs.writeFileSync(targetFile, content);

          const generatedContent = yaml.load(content) as any;
          expect(generatedContent.metadata.namespace).toBe(env.namespace);

          // Check ingress rules
          const rules = generatedContent.spec.rules;
          const domainRule = rules.find((rule: any) => rule.host === env.domain);
          expect(domainRule).toBeDefined();
        });

        test('should generate namespace manifest with correct name', () => {
          const sourceFile = path.join(k8sDir, 'namespace.yaml');
          const targetFile = path.join(envDir, 'namespace.yaml');

          let content = fs.readFileSync(sourceFile, 'utf8');
          content = content.replace(/name: devpocket-prod/g, `name: ${env.namespace}`);

          fs.writeFileSync(targetFile, content);

          const generatedContent = yaml.load(content) as any;
          expect(generatedContent.metadata.name).toBe(env.namespace);
        });

        test('all generated manifests should have valid YAML syntax', () => {
          expectedManifests.forEach(manifest => {
            const manifestPath = path.join(envDir, manifest);
            if (fs.existsSync(manifestPath)) {
              const content = fs.readFileSync(manifestPath, 'utf8');
              expect(() => {
                yaml.load(content);
              }).not.toThrow();
            }
          });
        });
      });
    });
  });

  describe('Resource Requirements Validation', () => {
    test('development environment should have reduced resource requirements', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');

      // Apply dev transformations
      const devContent = content
        .replace(/memory: "256Mi"/g, 'memory: "128Mi"')
        .replace(/cpu: "200m"/g, 'cpu: "100m"')
        .replace(/memory: "512Mi"/g, 'memory: "256Mi"')
        .replace(/cpu: "500m"/g, 'cpu: "300m"');

      const deployment = yaml.load(devContent) as any;
      const container = deployment.spec.template.spec.containers[0];

      expect(container.resources.requests.memory).toBe('128Mi');
      expect(container.resources.requests.cpu).toBe('100m');
      expect(container.resources.limits.memory).toBe('256Mi');
      expect(container.resources.limits.cpu).toBe('300m');
    });

    test('production environment should have standard resource requirements', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;
      const container = deployment.spec.template.spec.containers[0];

      expect(container.resources.requests.memory).toBe('256Mi');
      expect(container.resources.requests.cpu).toBe('200m');
      expect(container.resources.limits.memory).toBe('512Mi');
      expect(container.resources.limits.cpu).toBe('500m');
    });
  });

  describe('Security Configuration Validation', () => {
    test('deployment should have security context configured', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;

      const securityContext = deployment.spec.template.spec.securityContext;
      expect(securityContext).toBeDefined();
      expect(securityContext.runAsNonRoot).toBe(true);
      expect(securityContext.runAsUser).toBeDefined();
    });

    test('service should have correct port configuration', () => {
      const servicePath = path.join(k8sDir, 'service.yaml');
      const content = fs.readFileSync(servicePath, 'utf8');
      const service = yaml.load(content) as any;

      expect(service.spec.ports).toHaveLength(1);
      expect(service.spec.ports[0].port).toBe(80);
      expect(service.spec.ports[0].targetPort).toBe(8000);
      expect(service.spec.ports[0].protocol).toBe('TCP');
    });

    test('ingress should have TLS configuration', () => {
      const ingressPath = path.join(k8sDir, 'ingress.yaml');
      const content = fs.readFileSync(ingressPath, 'utf8');
      const ingress = yaml.load(content) as any;

      expect(ingress.spec.tls).toBeDefined();
      expect(ingress.spec.tls.length).toBeGreaterThan(0);

      ingress.spec.tls.forEach((tls: any) => {
        expect(tls.secretName).toBeDefined();
        expect(tls.hosts).toBeDefined();
        expect(tls.hosts.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Label and Selector Consistency', () => {
    test('deployment labels should match service selector', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const servicePath = path.join(k8sDir, 'service.yaml');

      const deploymentContent = fs.readFileSync(deploymentPath, 'utf8');
      const serviceContent = fs.readFileSync(servicePath, 'utf8');

      const deployment = yaml.load(deploymentContent) as any;
      const service = yaml.load(serviceContent) as any;

      const deploymentLabels = deployment.spec.template.metadata.labels;
      const serviceSelector = service.spec.selector;

      Object.keys(serviceSelector).forEach(key => {
        expect(deploymentLabels[key]).toBe(serviceSelector[key]);
      });
    });

    test('all manifests should have consistent app labels', () => {
      const expectedAppName = 'devpocket-nodejs';

      expectedManifests.forEach(manifestFile => {
        if (manifestFile === 'namespace.yaml') return; // Skip namespace as it doesn't have app labels

        const manifestPath = path.join(k8sDir, manifestFile);
        const content = fs.readFileSync(manifestPath, 'utf8');
        const manifest = yaml.load(content) as any;

        if (manifest.metadata?.labels) {
          expect(manifest.metadata.labels['app.kubernetes.io/name']).toBe(expectedAppName);
        }
      });
    });
  });

  describe('Environment Variables Configuration', () => {
    test('deployment should have required environment variables', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;

      const container = deployment.spec.template.spec.containers[0];
      const envVars = container.env || [];
      const envNames = envVars.map((env: any) => env.name);

      const requiredEnvVars = ['NODE_ENV', 'PORT', 'DATABASE_URL', 'SECRET_KEY', 'LOG_LEVEL'];

      requiredEnvVars.forEach(envVar => {
        expect(envNames).toContain(envVar);
      });
    });

    test('sensitive environment variables should use secrets', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;

      const container = deployment.spec.template.spec.containers[0];
      const envVars = container.env || [];

      const sensitiveVars = ['DATABASE_URL', 'SECRET_KEY'];

      sensitiveVars.forEach(sensitiveVar => {
        const envVar = envVars.find((env: any) => env.name === sensitiveVar);
        if (envVar) {
          expect(envVar.valueFrom?.secretKeyRef || envVar.valueFrom?.configMapKeyRef).toBeDefined();
        }
      });
    });
  });

  describe('Rollout Strategy Validation', () => {
    test('deployment should have rolling update strategy', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;

      expect(deployment.spec.strategy?.type).toBe('RollingUpdate');
      expect(deployment.spec.strategy?.rollingUpdate).toBeDefined();
    });

    test('deployment should have health checks configured', () => {
      const deploymentPath = path.join(k8sDir, 'deployment.yaml');
      const content = fs.readFileSync(deploymentPath, 'utf8');
      const deployment = yaml.load(content) as any;

      const container = deployment.spec.template.spec.containers[0];
      expect(container.livenessProbe).toBeDefined();

      // Check probe configurations
      expect(container.livenessProbe.httpGet?.path).toBe('/api/v1/health');
    });
  });
});

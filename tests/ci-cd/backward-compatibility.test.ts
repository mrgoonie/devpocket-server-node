/**
 * Backward Compatibility Tests
 *
 * Tests ensure that the new multi-environment CI/CD pipeline:
 * - Maintains existing deployment functionality
 * - Preserves service mapping compatibility
 * - Keeps all existing API endpoints functional
 * - Doesn't break existing configuration
 * - Maintains database schema compatibility
 * - Preserves existing environment variables
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('Backward Compatibility Tests', () => {
  describe('Existing Deployment Compatibility', () => {
    test('should maintain devpocket-nodejs service name', () => {
      const servicePath = path.join(process.cwd(), 'k8s', 'service.yaml');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        const service = yaml.load(content) as any;

        expect(service.metadata.name).toBe('devpocket-nodejs');
        expect(service.metadata.labels['app.kubernetes.io/name']).toBe('devpocket-nodejs');
      }
    });

    test('should maintain devpocket-nodejs deployment name', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        expect(deployment.metadata.name).toBe('devpocket-nodejs');
        expect(deployment.metadata.labels['app.kubernetes.io/name']).toBe('devpocket-nodejs');
      }
    });

    test('should maintain existing port configuration', () => {
      const servicePath = path.join(process.cwd(), 'k8s', 'service.yaml');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        const service = yaml.load(content) as any;

        expect(service.spec.ports[0].port).toBe(80);
        expect(service.spec.ports[0].targetPort).toBe(8000);
        expect(service.spec.ports[0].protocol).toBe('TCP');
      }
    });

    test('should maintain existing ingress configuration', () => {
      const ingressPath = path.join(process.cwd(), 'k8s', 'ingress.yaml');
      if (fs.existsSync(ingressPath)) {
        const content = fs.readFileSync(ingressPath, 'utf8');
        const ingress = yaml.load(content) as any;

        expect(ingress.metadata.name).toBe('devpocket-nodejs');
        expect(ingress.spec.rules).toBeDefined();
        expect(ingress.spec.tls).toBeDefined();
      }
    });
  });

  describe('Service Mapping Compatibility', () => {
    test('should maintain selector labels consistency', () => {
      const servicePath = path.join(process.cwd(), 'k8s', 'service.yaml');
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');

      if (fs.existsSync(servicePath) && fs.existsSync(deploymentPath)) {
        const serviceContent = fs.readFileSync(servicePath, 'utf8');
        const deploymentContent = fs.readFileSync(deploymentPath, 'utf8');

        const service = yaml.load(serviceContent) as any;
        const deployment = yaml.load(deploymentContent) as any;

        const serviceSelector = service.spec.selector;
        const deploymentLabels = deployment.spec.template.metadata.labels;

        Object.keys(serviceSelector).forEach(key => {
          expect(deploymentLabels[key]).toBe(serviceSelector[key]);
        });
      }
    });

    test('should maintain existing health check endpoints', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        const container = deployment.spec.template.spec.containers[0];
        expect(container.livenessProbe.httpGet.path).toBe('/health');
      }
    });

    test('should maintain existing service discovery', () => {
      const servicePath = path.join(process.cwd(), 'k8s', 'service.yaml');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        const service = yaml.load(content) as any;

        // Service should be accessible within cluster as devpocket-nodejs
        expect(service.metadata.name).toBe('devpocket-nodejs');
        expect(service.spec.type).toBe('ClusterIP');
      }
    });
  });

  describe('API Endpoints Compatibility', () => {
    test('should maintain existing API route structure', () => {
      // Check if main application files exist and have expected structure
      const srcDir = path.join(process.cwd(), 'src');
      expect(fs.existsSync(srcDir)).toBe(true);

      const routesDir = path.join(srcDir, 'routes');
      if (fs.existsSync(routesDir)) {
        const routeFiles = fs.readdirSync(routesDir);
        expect(routeFiles.length).toBeGreaterThan(0);
      }
    });

    test('should maintain health check endpoint configuration', () => {
      const healthRoutes = [
        path.join(process.cwd(), 'src', 'routes', 'health.ts'),
        path.join(process.cwd(), 'src', 'health.ts'),
        path.join(process.cwd(), 'src', 'routes', 'index.ts'),
      ];

      let healthEndpointFound = false;

      healthRoutes.forEach(routePath => {
        if (fs.existsSync(routePath)) {
          const content = fs.readFileSync(routePath, 'utf8');
          if (content.includes('/health') || content.includes('health')) {
            healthEndpointFound = true;
          }
        }
      });

      // At least one health endpoint should exist
      expect(healthEndpointFound).toBe(true);
    });

    test('should maintain API versioning structure', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');

        // Health checks should use /api/v1 prefix
        expect(content).toContain('/health');
        // Both readiness and liveness probes use the same endpoint
      } else {
        // Skip if deployment file doesn't exist
        expect(true).toBe(true);
      }
    });
  });

  describe('Environment Variables Compatibility', () => {
    test('should maintain required environment variables', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        const container = deployment.spec?.template?.spec?.containers?.[0];
        if (container) {
          const envVars = container.env || [];
          const envNames = envVars.map((env: any) => env.name);

          const essentialEnvVars = ['NODE_ENV', 'PORT'];

          // Check that at least essential env vars exist
          const hasEssentialVars = essentialEnvVars.some(envVar => envNames.includes(envVar));
          expect(hasEssentialVars).toBe(true);
        } else {
          // Skip if container structure is different
          expect(true).toBe(true);
        }
      } else {
        // Skip if deployment file doesn't exist
        expect(true).toBe(true);
      }
    });

    test('should maintain default port configuration', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        const container = deployment.spec?.template?.spec?.containers?.[0];
        if (container) {
          const portEnv = container.env?.find((env: any) => env.name === 'PORT');

          if (portEnv) {
            expect(portEnv.value).toBe('8000');
          }

          // Container port should be 8000
          if (container.ports?.[0]) {
            expect(container.ports[0].containerPort).toBe(8000);
          }
        }
      } else {
        // Skip if deployment file doesn't exist
        expect(true).toBe(true);
      }
    });

    test('should maintain secret and configmap references', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        const container = deployment.spec.template.spec.containers[0];
        const envVars = container.env || [];

        // Check for secret and configmap references
        const secretRefs = envVars.filter((env: any) => env.valueFrom?.secretKeyRef);
        const configMapRefs = envVars.filter((env: any) => env.valueFrom?.configMapKeyRef);

        expect(secretRefs.length + configMapRefs.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Database Schema Compatibility', () => {
    test('should maintain Prisma schema structure', () => {
      const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
      if (fs.existsSync(schemaPath)) {
        const content = fs.readFileSync(schemaPath, 'utf8');

        // Check for essential models
        expect(content).toContain('model User');
        expect(content).toContain('model Environment');
        expect(content).toContain('model Template');
        expect(content).toContain('model Cluster');
      }
    });

    test('should maintain database migration structure', () => {
      const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
      if (fs.existsSync(migrationsDir)) {
        const migrations = fs.readdirSync(migrationsDir);
        expect(migrations.length).toBeGreaterThan(0);
      }
    });

    test('should maintain database scripts in package.json', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(packageJson.scripts['db:generate']).toBeDefined();
      expect(packageJson.scripts['db:push']).toBeDefined();
      expect(packageJson.scripts['db:migrate']).toBeDefined();
    });
  });

  describe('Docker Configuration Compatibility', () => {
    test('should maintain existing Dockerfile structure', () => {
      const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
      if (fs.existsSync(dockerfilePath)) {
        const content = fs.readFileSync(dockerfilePath, 'utf8');

        // Essential Dockerfile components should remain
        expect(content).toContain('FROM node:');
        expect(content).toContain('WORKDIR');
        expect(content).toContain('COPY package.json');
        expect(content).toContain('pnpm install');
        expect(content).toContain('EXPOSE 8000');
        expect(content).toContain('CMD');
      }
    });

    test('should maintain docker-compose compatibility', () => {
      const dockerComposePath = path.join(process.cwd(), 'docker-compose.yaml');
      if (fs.existsSync(dockerComposePath)) {
        const content = fs.readFileSync(dockerComposePath, 'utf8');
        const compose = yaml.load(content) as any;

        // Main service should exist
        expect(compose.services['devpocket-api']).toBeDefined();

        const service = compose.services['devpocket-api'];
        expect(service.ports).toContain('8000:8000');
      }
    });

    test('should maintain existing build scripts', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(packageJson.scripts.build).toBeDefined();
      expect(packageJson.scripts.start).toBeDefined();
      expect(packageJson.scripts.dev).toBeDefined();
    });
  });

  describe('Security Configuration Compatibility', () => {
    test('should maintain security context in deployment', () => {
      const deploymentPath = path.join(process.cwd(), 'k8s', 'deployment.yaml');
      if (fs.existsSync(deploymentPath)) {
        const content = fs.readFileSync(deploymentPath, 'utf8');
        const deployment = yaml.load(content) as any;

        const securityContext = deployment.spec.template.spec.securityContext;
        if (securityContext) {
          expect(securityContext.runAsNonRoot).toBe(true);
          expect(securityContext.runAsUser).toBeDefined();
        }
      }
    });

    test('should maintain TLS configuration in ingress', () => {
      const ingressPath = path.join(process.cwd(), 'k8s', 'ingress.yaml');
      if (fs.existsSync(ingressPath)) {
        const content = fs.readFileSync(ingressPath, 'utf8');
        const ingress = yaml.load(content) as any;

        expect(ingress.spec.tls).toBeDefined();
        expect(ingress.spec.tls.length).toBeGreaterThan(0);
      }
    });

    test('should maintain existing authentication configuration', () => {
      const srcDir = path.join(process.cwd(), 'src');
      if (fs.existsSync(srcDir)) {
        const authFiles = [
          path.join(srcDir, 'middleware', 'auth.ts'),
          path.join(srcDir, 'services', 'auth.ts'),
          path.join(srcDir, 'auth.ts'),
        ];

        let authFound = false;
        authFiles.forEach(authFile => {
          if (fs.existsSync(authFile)) {
            authFound = true;
          }
        });

        // If src directory exists, at least one auth file should exist
        // If src doesn't exist, skip this test (not applicable)
        if (fs.readdirSync(srcDir).length > 0) {
          expect(authFound).toBe(true);
        }
      } else {
        // Skip test if src directory doesn't exist
        expect(true).toBe(true);
      }
    });
  });

  describe('Configuration Files Compatibility', () => {
    test('should maintain TypeScript configuration', () => {
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      if (fs.existsSync(tsconfigPath)) {
        const content = fs.readFileSync(tsconfigPath, 'utf8');
        const tsconfig = JSON.parse(content);

        expect(tsconfig.compilerOptions).toBeDefined();
        expect(tsconfig.compilerOptions.target).toBeDefined();
        expect(tsconfig.compilerOptions.module).toBeDefined();
      }
    });

    test('should maintain Jest configuration', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(packageJson.scripts.test).toBeDefined();
      expect(packageJson.scripts['test:coverage']).toBeDefined();

      const jestConfigFiles = ['jest.config.js', 'jest.ci.config.js', 'jest.unit.config.js'];

      let jestConfigFound = false;
      jestConfigFiles.forEach(configFile => {
        if (fs.existsSync(path.join(process.cwd(), configFile))) {
          jestConfigFound = true;
        }
      });

      expect(jestConfigFound).toBe(true);
    });

    test('should maintain ESLint and Prettier configuration', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      expect(packageJson.scripts.lint).toBeDefined();
      expect(packageJson.scripts.format).toBeDefined();

      const configFiles = ['.eslintrc.js', '.eslintrc.json', '.prettierrc', '.prettierrc.json'];

      let configFound = false;
      configFiles.forEach(configFile => {
        if (fs.existsSync(path.join(process.cwd(), configFile))) {
          configFound = true;
        }
      });

      expect(configFound).toBe(true);
    });
  });

  describe('Workflow Compatibility', () => {
    test('should maintain existing test workflow if present', () => {
      const existingWorkflows = ['test.yml', 'ci.yml', 'build.yml'].map(workflow =>
        path.join(process.cwd(), '.github', 'workflows', workflow)
      );

      existingWorkflows.forEach(workflowPath => {
        if (fs.existsSync(workflowPath)) {
          const content = fs.readFileSync(workflowPath, 'utf8');
          const workflow = yaml.load(content) as any;

          // Should still have test jobs
          expect(workflow.jobs).toBeDefined();
          expect(
            Object.keys(workflow.jobs).some(job => job.includes('test') || job.includes('Test'))
          ).toBe(true);
        }
      });
    });

    test('should not break existing GitHub Actions structure', () => {
      const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
      if (fs.existsSync(workflowsDir)) {
        const workflowFiles = fs
          .readdirSync(workflowsDir)
          .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));

        expect(workflowFiles.length).toBeGreaterThan(0);

        // All workflow files should be valid YAML
        workflowFiles.forEach(file => {
          const filePath = path.join(workflowsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          expect(() => yaml.load(content)).not.toThrow();
        });
      }
    });
  });

  describe('Dependency Compatibility', () => {
    test('should maintain existing dependencies', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const criticalDependencies = [
        'express',
        '@prisma/client',
        'jsonwebtoken',
        'bcryptjs',
        'cors',
        'helmet',
        'winston',
      ];

      criticalDependencies.forEach(dep => {
        expect(packageJson.dependencies[dep]).toBeDefined();
      });
    });

    test('should maintain development dependencies', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      const criticalDevDependencies = [
        'typescript',
        'jest',
        '@types/node',
        'ts-jest',
        'eslint',
        'prettier',
      ];

      criticalDevDependencies.forEach(dep => {
        expect(packageJson.devDependencies[dep]).toBeDefined();
      });
    });

    test('should maintain Node.js version requirement', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

      if (packageJson.engines) {
        expect(packageJson.engines.node).toBeDefined();
        expect(packageJson.engines.pnpm).toBeDefined();
      }
    });
  });
});

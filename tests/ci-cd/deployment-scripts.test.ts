/**
 * Deployment Scripts Tests with Dry-Run Functionality
 * 
 * Tests validate:
 * - Script existence and permissions
 * - Command-line argument parsing
 * - Dry-run functionality
 * - Environment-specific configurations
 * - Error handling and validation
 * - Script output and logging
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Deployment Scripts Tests', () => {
  const scriptsDir = path.join(process.cwd(), 'scripts', 'deployment');
  const tempDir = path.join(process.cwd(), 'temp-scripts-test');
  
  const deploymentScripts = [
    'generate-manifests.sh',
    'cleanup-environments.sh', 
    'rollback-deployment.sh'
  ];

  beforeAll(() => {
    // Create temp directory for test outputs
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

  describe('Script Files Existence and Permissions', () => {
    deploymentScripts.forEach(script => {
      test(`${script} should exist`, () => {
        const scriptPath = path.join(scriptsDir, script);
        expect(fs.existsSync(scriptPath)).toBe(true);
      });

      test(`${script} should be executable`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const stats = fs.statSync(scriptPath);
        expect(stats.mode & parseInt('111', 8)).not.toBe(0);
      });

      test(`${script} should have proper shebang`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        expect(content.startsWith('#!/bin/bash')).toBe(true);
      });

      test(`${script} should have error handling (set -euo pipefail)`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        expect(content).toContain('set -euo pipefail');
      });
    });
  });

  describe('Generate Manifests Script', () => {
    const scriptPath = path.join(scriptsDir, 'generate-manifests.sh');

    test('should show usage when no arguments provided', async () => {
      try {
        await execAsync(`bash ${scriptPath}`);
        fail('Expected script to exit with error when no arguments provided');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Usage:');
        expect(error.stdout || error.stderr).toContain('Environment (-e) is required');
      }
    });

    test('should show help when -h flag is used', async () => {
      const { stdout } = await execAsync(`bash ${scriptPath} -h`);
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('-e, --environment');
      expect(stdout).toContain('-i, --image');
    });

    test('should validate environment parameter', async () => {
      try {
        await execAsync(`bash ${scriptPath} -e invalid -i test:latest`);
        fail('Expected script to exit with error for invalid environment');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Environment must be one of: dev, beta, prod');
      }
    });

    test('should require image parameter', async () => {
      try {
        await execAsync(`bash ${scriptPath} -e dev`);
        fail('Expected script to exit with error when image not provided');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Image (-i) is required');
      }
    });

    test('should generate manifests for dev environment', async () => {
      const outputDir = path.join(tempDir, 'k8s-dev-test');
      const { stdout } = await execAsync(
        `bash ${scriptPath} -e dev -i digitop/devpocket-nodejs:dev-latest -o ${outputDir}`
      );

      expect(stdout).toContain('Generating manifests for environment: dev');
      expect(stdout).toContain('Using image: digitop/devpocket-nodejs:dev-latest'); 
      expect(stdout).toContain('Manifest generation completed!');

      // Check generated files exist
      expect(fs.existsSync(path.join(outputDir, 'namespace.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'deployment.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'service.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'ingress.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'README.md'))).toBe(true);
    });

    test('should generate manifests with correct environment-specific values', async () => {
      const environments = [
        { env: 'dev', namespace: 'devpocket-dev', domain: 'api.dev.devpocket.app' },
        { env: 'beta', namespace: 'devpocket-beta', domain: 'api.beta.devpocket.app' },
        { env: 'prod', namespace: 'devpocket-prod', domain: 'api.devpocket.app' }
      ];

      for (const { env, namespace, domain } of environments) {
        const outputDir = path.join(tempDir, `k8s-${env}-test`);
        await execAsync(
          `bash ${scriptPath} -e ${env} -i digitop/devpocket-nodejs:${env}-latest -o ${outputDir}`
        );

        // Check namespace file
        const namespaceContent = fs.readFileSync(path.join(outputDir, 'namespace.yaml'), 'utf8');
        expect(namespaceContent).toContain(`name: ${namespace}`);

        // Check deployment file
        const deploymentContent = fs.readFileSync(path.join(outputDir, 'deployment.yaml'), 'utf8');
        expect(deploymentContent).toContain(`namespace: ${namespace}`);
        expect(deploymentContent).toContain(`digitop/devpocket-nodejs:${env}-latest`);

        // Check ingress file
        const ingressContent = fs.readFileSync(path.join(outputDir, 'ingress.yaml'), 'utf8');
        expect(ingressContent).toContain(`namespace: ${namespace}`);
        expect(ingressContent).toContain(domain);
      }
    });

    test('should create appropriate resource limits for dev environment', async () => {
      const outputDir = path.join(tempDir, 'k8s-dev-resources-test');
      await execAsync(
        `bash ${scriptPath} -e dev -i digitop/devpocket-nodejs:dev-latest -o ${outputDir}`
      );

      const deploymentContent = fs.readFileSync(path.join(outputDir, 'deployment.yaml'), 'utf8');
      expect(deploymentContent).toContain('memory: "128Mi"'); // Dev has reduced memory
      expect(deploymentContent).toContain('cpu: "100m"'); // Dev has reduced CPU
    });
  });

  describe('Cleanup Environments Script', () => {
    const scriptPath = path.join(scriptsDir, 'cleanup-environments.sh');

    test('should show usage when no arguments provided', async () => {
      try {
        await execAsync(`bash ${scriptPath}`);
        fail('Expected script to exit with error when no arguments provided');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Usage:');
        expect(error.stdout || error.stderr).toContain('Either environment (-e) or namespace (-n) must be specified');
      }
    });

    test('should show help when -h flag is used', async () => {
      const { stdout } = await execAsync(`bash ${scriptPath} -h`);
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('-e, --environment');
      expect(stdout).toContain('-d, --dry-run');
    });

    test('should validate environment parameter', async () => {
      try {
        await execAsync(`bash ${scriptPath} -e invalid`);
        fail('Expected script to exit with error for invalid environment');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Unknown environment: invalid. Use dev, beta, or prod');
      }
    });

    test('should map environment to correct namespace', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('NAMESPACE="devpocket-dev"');
      expect(scriptContent).toContain('NAMESPACE="devpocket-beta"');
      expect(scriptContent).toContain('NAMESPACE="devpocket-prod"');
    });

    test('should support dry-run mode', async () => {
      // Since we can't test with real kubectl, we test the dry-run flag parsing
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('DRY_RUN=false');
      expect(scriptContent).toContain('--dry-run');
      expect(scriptContent).toContain('DRY_RUN=true');
      expect(scriptContent).toContain('Would delete the above resources');
    });

    test('should have proper resource cleanup order', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('RESOURCE_ORDER=("ingress" "service" "deployment" "configmap" "secret" "pvc")');
    });

    test('should exclude default Kubernetes resources', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('grep -v kubernetes'); // Exclude default kubernetes service
      expect(scriptContent).toContain('grep -v -E \'^(kube-root-ca.crt)$\''); // Exclude default configmap
      expect(scriptContent).toContain('grep -v -E \'^(default-token-|sh\\.helm\\.release\\.)\''); // Exclude default secrets
    });
  });

  describe('Rollback Deployment Script', () => {
    const scriptPath = path.join(scriptsDir, 'rollback-deployment.sh');

    test('should show usage when no arguments provided', async () => {
      try {
        await execAsync(`bash ${scriptPath}`);
        fail('Expected script to exit with error when no arguments provided');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Usage:');
        expect(error.stdout || error.stderr).toContain('Either environment (-e) or namespace (-n) must be specified');
      }
    });

    test('should show help when -h flag is used', async () => {
      const { stdout } = await execAsync(`bash ${scriptPath} -h`);
      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('Examples:');
      expect(stdout).toContain('-e, --environment');
      expect(stdout).toContain('-r, --revision');
    });

    test('should validate environment parameter', async () => {
      try {
        await execAsync(`bash ${scriptPath} -e invalid`);
        fail('Expected script to exit with error for invalid environment');
      } catch (error: any) {
        expect(error.stdout || error.stderr).toContain('Unknown environment: invalid. Use dev, beta, or prod');
      }
    });

    test('should map environment to correct namespace', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('NAMESPACE="devpocket-dev"');
      expect(scriptContent).toContain('NAMESPACE="devpocket-beta"');
      expect(scriptContent).toContain('NAMESPACE="devpocket-prod"');
    });

    test('should support dry-run mode', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('DRY_RUN=false');
      expect(scriptContent).toContain('--dry-run');
      expect(scriptContent).toContain('DRY_RUN=true');
      expect(scriptContent).toContain('Would rollback deployment');
    });

    test('should use correct deployment name', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('DEPLOYMENT_NAME="devpocket-nodejs"');
    });

    test('should have production safety checks', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('You are about to rollback a PRODUCTION deployment!');
      expect(scriptContent).toContain('ENVIRONMENT" == "prod"');
    });

    test('should handle revision calculation', () => {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('TARGET_REVISION=$((CURRENT_REVISION - 1))');
      expect(scriptContent).toContain('No previous revision available');
    });
  });

  describe('Script Integration and Common Features', () => {
    deploymentScripts.forEach(script => {
      test(`${script} should have colored logging functions`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('RED=\'\\033[0;31m\'');
        expect(content).toContain('GREEN=\'\\033[0;32m\'');
        expect(content).toContain('YELLOW=\'\\033[1;33m\'');
        expect(content).toContain('BLUE=\'\\033[0;34m\'');
        expect(content).toContain('NC=\'\\033[0m\'');
        
        expect(content).toContain('log()');
        expect(content).toContain('warn()');
        expect(content).toContain('error()');
        expect(content).toContain('success()');
      });

      test(`${script} should support force mode`, () => {
        if (script === 'generate-manifests.sh') return; // Skip for manifest generator
        
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('FORCE=false');
        expect(content).toContain('--force');
        expect(content).toContain('FORCE=true');
      });

      test(`${script} should have proper command line parsing`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('while [[ $# -gt 0 ]]');
        expect(content).toContain('case $1 in');
        expect(content).toContain('shift');
      });

      test(`${script} should validate required dependencies`, () => {
        if (script === 'generate-manifests.sh') return; // Skip for manifest generator
        
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('kubectl');
        expect(content).toContain('command -v kubectl');
      });
    });
  });

  describe('Template System Validation', () => {
    test('should reference correct template directory structure', () => {
      const scriptPath = path.join(scriptsDir, 'generate-manifests.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');
      
      expect(content).toContain('TEMPLATE_DIR="$PROJECT_ROOT/k8s/templates"');
      expect(content).toContain('TEMPLATES=("namespace.yaml" "service.yaml" "deployment.yaml" "ingress.yaml")');
    });

    test('should handle missing template files gracefully', () => {
      const scriptPath = path.join(scriptsDir, 'generate-manifests.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');
      
      expect(content).toContain('Template not found:');
      expect(content).toContain('if [[ -f "$template_file" ]]');
    });

    test('should have comprehensive template variable replacement', () => {
      const scriptPath = path.join(scriptsDir, 'generate-manifests.sh');
      const content = fs.readFileSync(scriptPath, 'utf8');
      
      const expectedVariables = [
        'NAMESPACE', 'ENVIRONMENT', 'IMAGE', 'VERSION', 'DOMAIN',
        'NODE_ENV', 'DEBUG', 'LOG_LEVEL', 'REPLICAS',
        'MEMORY_REQUEST', 'MEMORY_LIMIT', 'CPU_REQUEST', 'CPU_LIMIT'
      ];
      
      expectedVariables.forEach(variable => {
        expect(content).toContain(`{{ ${variable} }}`);
        expect(content).toContain(`$${variable}`);
      });
    });
  });

  describe('Error Handling and Validation', () => {
    deploymentScripts.forEach(script => {
      test(`${script} should validate input parameters`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('# Validate inputs');
        expect(content).toContain('if [[ -z');
        expect(content).toContain('exit 1');
      });

      test(`${script} should have timeout configurations`, () => {
        if (script === 'generate-manifests.sh') return; // Skip for manifest generator
        
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toMatch(/timeout=\d+s/);
      });
    });
  });

  describe('Output and Logging Validation', () => {
    test('generate-manifests.sh should create summary README', async () => {
      const outputDir = path.join(tempDir, 'k8s-readme-test');
      await execAsync(
        `bash ${path.join(scriptsDir, 'generate-manifests.sh')} -e dev -i test:latest -o ${outputDir}`
      );

      const readmePath = path.join(outputDir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      
      const readmeContent = fs.readFileSync(readmePath, 'utf8');
      expect(readmeContent).toContain('# DevPocket dev Environment Manifests');
      expect(readmeContent).toContain('Generated on:');
      expect(readmeContent).toContain('kubectl apply');
      expect(readmeContent).toContain('kubectl delete');
    });

    deploymentScripts.forEach(script => {
      test(`${script} should have informative usage function`, () => {
        const scriptPath = path.join(scriptsDir, script);
        const content = fs.readFileSync(scriptPath, 'utf8');
        
        expect(content).toContain('usage()');
        expect(content).toContain('Examples:');
        expect(content).toContain('echo "Usage:');
      });
    });
  });
});
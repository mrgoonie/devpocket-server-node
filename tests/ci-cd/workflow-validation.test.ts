/**
 * GitHub Actions Workflow Validation Tests
 * 
 * Tests validate:
 * - YAML syntax correctness
 * - Environment-specific configurations
 * - Branch-based triggering logic
 * - Docker tagging strategies
 * - Job dependencies and conditions
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('GitHub Actions Workflow Validation', () => {
  const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
  const expectedWorkflows = [
    'deploy-dev.yml',
    'deploy-beta.yml', 
    'deploy-production.yml'
  ];

  beforeAll(() => {
    expect(fs.existsSync(workflowsDir)).toBe(true);
  });

  describe('Workflow Files Existence', () => {
    expectedWorkflows.forEach(workflow => {
      test(`${workflow} should exist`, () => {
        const workflowPath = path.join(workflowsDir, workflow);
        expect(fs.existsSync(workflowPath)).toBe(true);
      });
    });
  });

  describe('YAML Syntax Validation', () => {
    expectedWorkflows.forEach(workflowFile => {
      test(`${workflowFile} should have valid YAML syntax`, () => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        
        expect(() => {
          yaml.load(content);
        }).not.toThrow();
      });
    });
  });

  describe('Environment-Specific Configuration', () => {
    test('deploy-dev.yml should have correct dev configuration', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-dev.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.env.KUBERNETES_NAMESPACE).toBe('devpocket-dev');
      expect(workflow.env.DOMAIN).toBe('api.dev.devpocket.app');
      expect(workflow.env.DOCKER_REGISTRY).toBe('docker.io');
      expect(workflow.env.DOCKER_IMAGE).toBe('digitop/devpocket-nodejs');
    });

    test('deploy-beta.yml should have correct beta configuration', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-beta.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.env.KUBERNETES_NAMESPACE).toBe('devpocket-beta');
      expect(workflow.env.DOMAIN).toBe('api.beta.devpocket.app');
      expect(workflow.env.DOCKER_REGISTRY).toBe('docker.io');
      expect(workflow.env.DOCKER_IMAGE).toBe('digitop/devpocket-nodejs');
    });

    test('deploy-production.yml should have correct production configuration', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-production.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.env.KUBERNETES_NAMESPACE).toBe('devpocket-prod');
      expect(workflow.env.DOCKER_REGISTRY).toBe('docker.io');
      expect(workflow.env.DOCKER_IMAGE).toBe('digitop/devpocket-nodejs');
      // Production doesn't have a DOMAIN env var as it uses the default
    });
  });

  describe('Branch Triggering Logic', () => {
    test('deploy-dev.yml should trigger on dev/* branches', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-dev.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.on.push.branches).toContain('dev/*');
      expect(workflow.on.workflow_dispatch).toBeDefined();
    });

    test('deploy-beta.yml should trigger on beta branch', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-beta.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.on.push.branches).toContain('beta');
      expect(workflow.on.workflow_dispatch).toBeDefined();
    });

    test('deploy-production.yml should trigger on main branch', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-production.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      expect(workflow.on.push.branches).toContain('main');
      expect(workflow.on.workflow_dispatch).toBeDefined();
    });
  });

  describe('Docker Tagging Strategy', () => {
    test('deploy-dev.yml should have correct dev tagging strategy', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-dev.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      const buildJob = workflow.jobs['build-and-push'];
      const metaStep = buildJob.steps.find((step: any) => step.id === 'meta');
      
      expect(metaStep.with.tags).toContain('type=raw,value=dev-latest');
      expect(metaStep.with.tags).toContain('type=raw,value=dev-${{ env.BRANCH_SAFE }}-${{ github.run_number }}-${{ env.SHORT_SHA }}');
    });

    test('deploy-beta.yml should have correct beta tagging strategy', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-beta.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      const buildJob = workflow.jobs['build-and-push'];
      const metaStep = buildJob.steps.find((step: any) => step.id === 'meta');
      
      expect(metaStep.with.tags).toContain('type=raw,value=beta-latest');
      expect(metaStep.with.tags).toContain('type=raw,value=${{ env.TAG_PREFIX }}${{ env.VERSION }}');
      expect(metaStep.with.tags).toContain('type=raw,value=beta-${{ github.run_number }}-${{ env.SHORT_SHA }}');
    });

    test('deploy-production.yml should have correct production tagging strategy', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-production.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');
      const workflow = yaml.load(content) as any;

      const buildJob = workflow.jobs['build-and-push'];
      const metaStep = buildJob.steps.find((step: any) => step.id === 'meta');
      
      expect(metaStep.with.tags).toContain('type=raw,value=latest,enable={{is_default_branch}}');
      expect(metaStep.with.tags).toContain('type=raw,value=${{ env.SEMANTIC_TAG }}');
      expect(metaStep.with.tags).toContain('type=raw,value=main-${{ github.run_number }}-${{ env.SHORT_SHA }}');
    });
  });

  describe('Job Dependencies and Conditions', () => {
    expectedWorkflows.forEach(workflowFile => {
      test(`${workflowFile} should have correct job dependencies`, () => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        const jobs = workflow.jobs;
        
        // Test job should exist
        expect(jobs.test).toBeDefined();
        
        // Build job should depend on test
        expect(jobs['build-and-push'].needs).toContain('test');
        
        // Deploy job should depend on test and build
        expect(jobs.deploy.needs).toContain('test');
        expect(jobs.deploy.needs).toContain('build-and-push');
        
        // Notify job should depend on all jobs
        expect(jobs.notify.needs).toContain('test');
        expect(jobs.notify.needs).toContain('build-and-push');
        expect(jobs.notify.needs).toContain('deploy');
        expect(jobs.notify.if).toBe('always()');
      });
    });

    test('beta and production workflows should have semantic-release job', () => {
      ['deploy-beta.yml', 'deploy-production.yml'].forEach(workflowFile => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        expect(workflow.jobs['semantic-release']).toBeDefined();
        expect(workflow.jobs['semantic-release'].needs).toContain('test');
        expect(workflow.jobs['build-and-push'].needs).toContain('semantic-release');
        expect(workflow.jobs.deploy.needs).toContain('semantic-release');
      });
    });
  });

  describe('Environment Protection', () => {
    test('workflows should have correct environment protection', () => {
      const configs = [
        { file: 'deploy-dev.yml', environment: 'development' },
        { file: 'deploy-beta.yml', environment: 'beta' },
        { file: 'deploy-production.yml', environment: 'production' }
      ];

      configs.forEach(({ file, environment }) => {
        const workflowPath = path.join(workflowsDir, file);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        expect(workflow.jobs.deploy.environment).toBe(environment);
      });
    });
  });

  describe('Secret Configuration', () => {
    expectedWorkflows.forEach(workflowFile => {
      test(`${workflowFile} should reference required secrets`, () => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');

        // Check for Docker secrets
        expect(content).toContain('secrets.DOCKER_USER');
        expect(content).toContain('secrets.DOCKER_PAT');
        
        // Check for kubeconfig secrets
        if (workflowFile === 'deploy-dev.yml') {
          expect(content).toContain('secrets.KUBECONFIG_DEV');
        } else if (workflowFile === 'deploy-beta.yml') {
          expect(content).toContain('secrets.KUBECONFIG_BETA');
        } else if (workflowFile === 'deploy-production.yml') {
          expect(content).toContain('secrets.KUBECONFIG');
        }
      });
    });

    test('semantic release workflows should reference GitHub and NPM tokens', () => {
      ['deploy-beta.yml', 'deploy-production.yml'].forEach(workflowFile => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');

        expect(content).toContain('secrets.GITHUB_TOKEN');
        expect(content).toContain('secrets.NPM_TOKEN');
      });
    });
  });

  describe('Force Deploy Option', () => {
    expectedWorkflows.forEach(workflowFile => {
      test(`${workflowFile} should support force deploy option`, () => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        const workflowDispatch = workflow.on.workflow_dispatch;
        expect(workflowDispatch.inputs.force_deploy).toBeDefined();
        expect(workflowDispatch.inputs.force_deploy.type).toBe('boolean');
        expect(workflowDispatch.inputs.force_deploy.default).toBe(false);

        // Check conditional logic in jobs
        expect(workflow.jobs['build-and-push'].if).toContain("github.event.inputs.force_deploy == 'true'");
        expect(workflow.jobs.deploy.if).toContain("github.event.inputs.force_deploy == 'true'");
      });
    });
  });

  describe('Test Environment Variables', () => {
    expectedWorkflows.forEach(workflowFile => {
      test(`${workflowFile} should have correct test environment variables`, () => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        const testJob = workflow.jobs.test;
        const testStep = testJob.steps.find((step: any) => step.name === 'Run tests' || step.name === 'Run full test suite' || step.name === 'Run simplified tests');
        
        expect(testStep.env.NODE_ENV).toBe('test');
        expect(testStep.env.JWT_SECRET).toBe('test-jwt-secret-key-for-ci');
        expect(testStep.env.GOOGLE_CLIENT_ID).toBe('fake-google-client-id');
        expect(testStep.env.GOOGLE_CLIENT_SECRET).toBe('fake-google-client-secret');
        expect(testStep.env.RESEND_API_KEY).toBe('fake-resend-api-key');
      });
    });
  });

  describe('Smoke Tests Configuration', () => {
    test('deploy-dev.yml should have lenient smoke tests', () => {
      const workflowPath = path.join(workflowsDir, 'deploy-dev.yml');
      const content = fs.readFileSync(workflowPath, 'utf8');

      expect(content).toContain('this is expected for new dev deployments');
      expect(content).not.toContain('exit 1');
    });

    test('deploy-beta.yml and deploy-production.yml should have strict smoke tests', () => {
      ['deploy-beta.yml', 'deploy-production.yml'].forEach(workflowFile => {
        const workflowPath = path.join(workflowsDir, workflowFile);
        const content = fs.readFileSync(workflowPath, 'utf8');
        const workflow = yaml.load(content) as any;

        const deployJob = workflow.jobs.deploy;
        const smokeTestStep = deployJob.steps.find((step: any) => step.name === 'Run smoke tests');
        
        expect(smokeTestStep.run).toContain('exit 1');
      });
    });
  });
});
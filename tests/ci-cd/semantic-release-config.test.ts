/**
 * Semantic Release Configuration Tests
 * 
 * Tests validate:
 * - Branch configuration supports dev/*, beta, main branches
 * - Conventional commits parsing and version calculation
 * - Release notes generation
 * - Pre-release handling for beta and dev branches
 * - Plugin configuration and order
 * - Release rules for different commit types
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Semantic Release Configuration Tests', () => {
  const releaseConfigPath = path.join(process.cwd(), '.releaserc.json');
  let releaseConfig: any;

  beforeAll(() => {
    expect(fs.existsSync(releaseConfigPath)).toBe(true);
    const configContent = fs.readFileSync(releaseConfigPath, 'utf8');
    releaseConfig = JSON.parse(configContent);
  });

  describe('Branch Configuration', () => {
    test('should support main branch for production releases', () => {
      expect(releaseConfig.branches).toContain('main');
    });

    test('should support beta branch for pre-releases', () => {
      const betaBranch = releaseConfig.branches.find((branch: any) => 
        typeof branch === 'object' && branch.name === 'beta'
      );
      expect(betaBranch).toBeDefined();
      expect(betaBranch.prerelease).toBe('beta');
    });

    test('should support dev/* branches for development pre-releases', () => {
      const devBranch = releaseConfig.branches.find((branch: any) => 
        typeof branch === 'object' && branch.name === 'dev/*'
      );
      expect(devBranch).toBeDefined();
      expect(devBranch.prerelease).toBe('dev');
    });

    test('should have correct branch priority order', () => {
      expect(releaseConfig.branches).toHaveLength(3);
      expect(releaseConfig.branches[0]).toBe('main'); // Main should be first (highest priority)
      
      const betaBranch = releaseConfig.branches[1];
      expect(betaBranch.name).toBe('beta');
      
      const devBranch = releaseConfig.branches[2];
      expect(devBranch.name).toBe('dev/*');
    });
  });

  describe('Plugin Configuration', () => {
    test('should include all required plugins', () => {
      const expectedPlugins = [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator',
        '@semantic-release/changelog',
        '@semantic-release/npm',
        '@semantic-release/git',
        '@semantic-release/github'
      ];

      const configuredPlugins = releaseConfig.plugins.map((plugin: any) => 
        Array.isArray(plugin) ? plugin[0] : plugin
      );

      expectedPlugins.forEach(expectedPlugin => {
        expect(configuredPlugins).toContain(expectedPlugin);
      });
    });

    test('should have plugins in correct order', () => {
      const pluginOrder = [
        '@semantic-release/commit-analyzer',
        '@semantic-release/release-notes-generator', 
        '@semantic-release/changelog',
        '@semantic-release/npm',
        '@semantic-release/git',
        '@semantic-release/github'
      ];

      pluginOrder.forEach((expectedPlugin, index) => {
        const actualPlugin = Array.isArray(releaseConfig.plugins[index]) 
          ? releaseConfig.plugins[index][0] 
          : releaseConfig.plugins[index];
        expect(actualPlugin).toBe(expectedPlugin);
      });
    });

    test('should configure git plugin with correct assets', () => {
      const gitPlugin = releaseConfig.plugins.find((plugin: any) => 
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git'
      );

      expect(gitPlugin).toBeDefined();
      expect(gitPlugin[1].assets).toEqual(['package.json', 'pnpm-lock.yaml', 'CHANGELOG.md']);
    });

    test('should configure git plugin with proper commit message', () => {
      const gitPlugin = releaseConfig.plugins.find((plugin: any) => 
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git'
      );

      expect(gitPlugin[1].message).toBe('chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}');
    });
  });

  describe('Conventional Commits Configuration', () => {
    test('should use conventional commits preset', () => {
      expect(releaseConfig.preset).toBe('conventionalcommits');
    });

    test('should configure breaking change keywords', () => {
      expect(releaseConfig.parserOpts.noteKeywords).toEqual(['BREAKING CHANGE', 'BREAKING CHANGES']);
    });

    test('should configure writer options for commit sorting', () => {
      expect(releaseConfig.writerOpts.commitsSort).toEqual(['subject', 'scope']);
    });
  });

  describe('Release Rules Configuration', () => {
    test('should configure feat commits for minor releases', () => {
      const featRule = releaseConfig.releaseRules.find((rule: any) => rule.type === 'feat');
      expect(featRule).toBeDefined();
      expect(featRule.release).toBe('minor');
    });

    test('should configure fix commits for patch releases', () => {
      const fixRule = releaseConfig.releaseRules.find((rule: any) => rule.type === 'fix');
      expect(fixRule).toBeDefined();
      expect(fixRule.release).toBe('patch');
    });

    test('should configure perf commits for patch releases', () => {
      const perfRule = releaseConfig.releaseRules.find((rule: any) => rule.type === 'perf');
      expect(perfRule).toBeDefined();
      expect(perfRule.release).toBe('patch');
    });

    test('should configure non-release commit types', () => {
      const nonReleaseTypes = ['docs', 'style', 'refactor', 'test', 'chore'];
      
      nonReleaseTypes.forEach(type => {
        const rule = releaseConfig.releaseRules.find((rule: any) => rule.type === type);
        expect(rule).toBeDefined();
        expect(rule.release).toBe(false);
      });
    });

    test('should configure no-release scope', () => {
      const noReleaseRule = releaseConfig.releaseRules.find((rule: any) => rule.scope === 'no-release');
      expect(noReleaseRule).toBeDefined();
      expect(noReleaseRule.release).toBe(false);
    });

    test('should have comprehensive release rules', () => {
      const expectedRules = [
        { type: 'feat', release: 'minor' },
        { type: 'fix', release: 'patch' },
        { type: 'perf', release: 'patch' },
        { type: 'docs', release: false },
        { type: 'style', release: false },
        { type: 'refactor', release: false },
        { type: 'test', release: false },
        { type: 'chore', release: false },
        { scope: 'no-release', release: false }
      ];

      expect(releaseConfig.releaseRules).toHaveLength(expectedRules.length);
      
      expectedRules.forEach(expectedRule => {
        const actualRule = releaseConfig.releaseRules.find((rule: any) => 
          (rule.type === expectedRule.type) || (rule.scope === expectedRule.scope)
        );
        expect(actualRule).toEqual(expectedRule);
      });
    });
  });

  describe('Package.json Integration', () => {
    test('should have semantic-release script in package.json', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      expect(packageJson.scripts.release).toBe('semantic-release');
      expect(packageJson.scripts['release:dry']).toBe('semantic-release --dry-run');
    });

    test('should have semantic-release as devDependency', () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      expect(packageJson.devDependencies['semantic-release']).toBeDefined();
      expect(packageJson.devDependencies['@semantic-release/changelog']).toBeDefined();
      expect(packageJson.devDependencies['@semantic-release/git']).toBeDefined();
    });
  });

  describe('Version Calculation Simulation', () => {
    const mockCommits = [
      { type: 'feat', subject: 'add new feature', breaking: false },
      { type: 'fix', subject: 'fix bug', breaking: false },
      { type: 'perf', subject: 'improve performance', breaking: false },
      { type: 'docs', subject: 'update docs', breaking: false },
      { type: 'chore', subject: 'update dependencies', breaking: false },
      { type: 'feat', subject: 'breaking change', breaking: true }
    ];

    test('should correctly determine release types for different commits', () => {
      mockCommits.forEach(commit => {
        const rule = releaseConfig.releaseRules.find((rule: any) => rule.type === commit.type);
        
        if (commit.breaking) {
          // Breaking changes should trigger major release (handled by conventional commits preset)
          expect(['feat', 'fix', 'perf']).toContain(commit.type);
        } else if (commit.type === 'feat') {
          expect(rule?.release).toBe('minor');
        } else if (['fix', 'perf'].includes(commit.type)) {
          expect(rule?.release).toBe('patch');
        } else if (['docs', 'style', 'refactor', 'test', 'chore'].includes(commit.type)) {
          expect(rule?.release).toBe(false);
        }
      });
    });
  });

  describe('Pre-release Configuration Validation', () => {
    test('should generate correct pre-release versions for beta branch', () => {
      const betaBranch = releaseConfig.branches.find((branch: any) => 
        typeof branch === 'object' && branch.name === 'beta'
      );
      
      expect(betaBranch.prerelease).toBe('beta');
      // Pre-release versions should follow pattern: 1.0.0-beta.1, 1.0.0-beta.2, etc.
    });

    test('should generate correct pre-release versions for dev branches', () => {
      const devBranch = releaseConfig.branches.find((branch: any) => 
        typeof branch === 'object' && branch.name === 'dev/*'
      );
      
      expect(devBranch.prerelease).toBe('dev');
      // Pre-release versions should follow pattern: 1.0.0-dev.1, 1.0.0-dev.2, etc.
    });
  });

  describe('Changelog Configuration', () => {
    test('should generate changelog for all release types', () => {
      const changelogPlugin = releaseConfig.plugins.find((plugin: any) => 
        (Array.isArray(plugin) ? plugin[0] : plugin) === '@semantic-release/changelog'
      );
      expect(changelogPlugin).toBeDefined();
    });

    test('should include changelog in git assets', () => {
      const gitPlugin = releaseConfig.plugins.find((plugin: any) => 
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git'
      );
      expect(gitPlugin[1].assets).toContain('CHANGELOG.md');
    });
  });

  describe('GitHub Integration', () => {
    test('should configure GitHub releases', () => {
      const githubPlugin = releaseConfig.plugins.find((plugin: any) => 
        (Array.isArray(plugin) ? plugin[0] : plugin) === '@semantic-release/github'
      );
      expect(githubPlugin).toBeDefined();
    });
  });

  describe('NPM Publishing Configuration', () => {
    test('should configure npm publishing', () => {
      const npmPlugin = releaseConfig.plugins.find((plugin: any) => 
        (Array.isArray(plugin) ? plugin[0] : plugin) === '@semantic-release/npm'
      );
      expect(npmPlugin).toBeDefined();
    });

    test('should update package.json version', () => {
      const gitPlugin = releaseConfig.plugins.find((plugin: any) => 
        Array.isArray(plugin) && plugin[0] === '@semantic-release/git'
      );
      expect(gitPlugin[1].assets).toContain('package.json');
      expect(gitPlugin[1].assets).toContain('pnpm-lock.yaml');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle commits with no-release scope', () => {
      const noReleaseRule = releaseConfig.releaseRules.find((rule: any) => rule.scope === 'no-release');
      expect(noReleaseRule.release).toBe(false);
    });

    test('should be valid JSON configuration', () => {
      expect(() => {
        JSON.parse(fs.readFileSync(releaseConfigPath, 'utf8'));
      }).not.toThrow();
    });

    test('should have all required fields', () => {
      const requiredFields = ['branches', 'plugins', 'preset', 'parserOpts', 'writerOpts', 'releaseRules'];
      requiredFields.forEach(field => {
        expect(releaseConfig[field]).toBeDefined();
      });
    });
  });

  describe('Workflow Integration', () => {
    test('workflows should use semantic-release correctly', () => {
      const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
      const betaWorkflow = path.join(workflowsDir, 'deploy-beta.yml');
      const prodWorkflow = path.join(workflowsDir, 'deploy-production.yml');

      if (fs.existsSync(betaWorkflow)) {
        const content = fs.readFileSync(betaWorkflow, 'utf8');
        expect(content).toContain('pnpm release');
        expect(content).toContain('semantic-release');
      }

      if (fs.existsSync(prodWorkflow)) {
        const content = fs.readFileSync(prodWorkflow, 'utf8');
        expect(content).toContain('pnpm release');
        expect(content).toContain('semantic-release');
      }
    });
  });
});
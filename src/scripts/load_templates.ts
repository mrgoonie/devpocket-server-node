#!/usr/bin/env tsx

import 'dotenv/config';
import { PrismaClient, TemplateCategory, TemplateStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import logger from '@/config/logger';

const prisma = new PrismaClient();

interface TemplateDefinition {
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  dockerImage: string;
  defaultPort: number;
  defaultResourcesCpu: string;
  defaultResourcesMemory: string;
  defaultResourcesStorage: string;
  environmentVariables: Record<string, string>;
  startupCommands: string[];
  documentationUrl?: string;
  iconUrl?: string;
  status: string;
  version: string;
}

function validateTemplate(template: any): template is TemplateDefinition {
  const required = [
    'name',
    'displayName',
    'description',
    'category',
    'tags',
    'dockerImage',
    'defaultPort',
    'defaultResourcesCpu',
    'defaultResourcesMemory',
    'defaultResourcesStorage',
    'environmentVariables',
    'startupCommands',
    'status',
    'version',
  ];

  for (const field of required) {
    if (!(field in template)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate category
  if (!Object.values(TemplateCategory).includes(template.category)) {
    throw new Error(
      `Invalid category: ${template.category}. Must be one of: ${Object.values(TemplateCategory).join(', ')}`
    );
  }

  // Validate status
  if (!Object.values(TemplateStatus).includes(template.status)) {
    throw new Error(
      `Invalid status: ${template.status}. Must be one of: ${Object.values(TemplateStatus).join(', ')}`
    );
  }

  // Validate types
  if (typeof template.name !== 'string') throw new Error('name must be a string');
  if (typeof template.displayName !== 'string') throw new Error('displayName must be a string');
  if (typeof template.description !== 'string') throw new Error('description must be a string');
  if (typeof template.dockerImage !== 'string') throw new Error('dockerImage must be a string');
  if (typeof template.defaultPort !== 'number') throw new Error('defaultPort must be a number');
  if (typeof template.version !== 'string') throw new Error('version must be a string');

  if (!Array.isArray(template.tags)) throw new Error('tags must be an array');
  if (!Array.isArray(template.startupCommands)) throw new Error('startupCommands must be an array');

  if (typeof template.environmentVariables !== 'object') {
    throw new Error('environmentVariables must be an object');
  }

  return true;
}

async function loadTemplate(filePath: string): Promise<void> {
  try {
    logger.info(`Loading template from ${filePath}`);

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const templateData = yaml.load(fileContent) as any;

    // Validate template structure
    validateTemplate(templateData);

    const template: TemplateDefinition = templateData;

    // Check if template already exists
    const existing = await prisma.template.findUnique({
      where: { name: template.name },
    });

    const templatePayload = {
      name: template.name,
      displayName: template.displayName,
      description: template.description,
      category: template.category as TemplateCategory,
      tags: template.tags,
      dockerImage: template.dockerImage,
      defaultPort: template.defaultPort,
      defaultResourcesCpu: template.defaultResourcesCpu,
      defaultResourcesMemory: template.defaultResourcesMemory,
      defaultResourcesStorage: template.defaultResourcesStorage,
      environmentVariables: template.environmentVariables,
      startupCommands: template.startupCommands,
      documentationUrl: template.documentationUrl || null,
      iconUrl: template.iconUrl || null,
      status: template.status as TemplateStatus,
      version: template.version,
    };

    if (existing) {
      // Update existing template
      await prisma.template.update({
        where: { name: template.name },
        data: {
          ...templatePayload,
          updatedAt: new Date(),
        },
      });
      logger.info(`Updated template: ${template.name}`);
    } else {
      // Create new template
      await prisma.template.create({
        data: templatePayload,
      });
      logger.info(`Created template: ${template.name}`);
    }
  } catch (error) {
    logger.error(`Failed to load template from ${filePath}:`, error);
    throw error;
  }
}

async function loadAllTemplates(): Promise<void> {
  const templatesDir = path.join(__dirname, 'templates');

  if (!fs.existsSync(templatesDir)) {
    logger.error(`Templates directory not found: ${templatesDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(templatesDir)
    .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

  if (files.length === 0) {
    logger.warn('No template files found in templates directory');
    return;
  }

  logger.info(`Found ${files.length} template files to load`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(templatesDir, file);
    try {
      await loadTemplate(filePath);
      successCount++;
    } catch (error) {
      logger.error(`Failed to load ${file}:`, error);
      errorCount++;
    }
  }

  logger.info(`Template loading completed: ${successCount} succeeded, ${errorCount} failed`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    logger.info('Starting template loading process...');
    await loadAllTemplates();
    logger.info('Template loading completed successfully');
  } catch (error) {
    logger.error('Template loading failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle CLI arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: tsx scripts/load_templates.ts [options]

Options:
  --help, -h     Show this help message
  
Environment Variables:
  DATABASE_URL   PostgreSQL connection string
  
Description:
  Loads all YAML template files from ./scripts/templates/ into the database.
  Templates with existing names will be updated.
  
Example:
  tsx scripts/load_templates.ts
  `);
  process.exit(0);
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { loadTemplate, loadAllTemplates };

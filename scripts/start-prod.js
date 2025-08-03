#!/usr/bin/env node

// Register tsconfig-paths to handle TypeScript path aliases at runtime
const tsConfigPaths = require('tsconfig-paths');
const path = require('path');

tsConfigPaths.register({
  baseUrl: path.join(__dirname, '..', 'dist'),
  paths: {
    "@/*": ["*"],
    "@/types/*": ["types/*"],
    "@/utils/*": ["utils/*"],
    "@/services/*": ["services/*"],
    "@/controllers/*": ["controllers/*"],
    "@/middleware/*": ["middleware/*"],
    "@/routes/*": ["routes/*"],
    "@/config/*": ["config/*"]
  }
});

// Start the application
require('../dist/index.js');
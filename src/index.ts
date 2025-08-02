import 'dotenv/config';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import app from './app';
import { getConfig } from '@/config/env';
import logger from '@/config/logger';
import db from '@/config/database';
import { initializeWebSocketServer } from '@/services/websocket';

const config = getConfig();

async function startServer(): Promise<void> {
  try {
    // Connect to database
    await db.connect();
    logger.info('Database connected successfully');

    // Run migrations in development
    if (config.NODE_ENV === 'development') {
      await db.runMigrations();
    }

    // Create HTTP server
    const server = createServer(app);

    // Initialize WebSocket server
    const wss = new WebSocketServer({ 
      server,
      path: '/api/v1/ws'
    });
    
    initializeWebSocketServer(wss);
    logger.info('WebSocket server initialized');

    // Start listening
    server.listen(config.PORT, config.HOST, () => {
      logger.info(`Server started successfully`, {
        host: config.HOST,
        port: config.PORT,
        environment: config.NODE_ENV,
        pid: process.pid,
        documentation: config.ENABLE_API_DOCS ? `http://${config.HOST}:${config.PORT}/api-docs` : null,
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', { error });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Start the server
startServer();

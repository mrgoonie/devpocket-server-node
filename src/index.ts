import 'dotenv/config';
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import { Socket } from 'net';
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
      noServer: true,
    });

    // Handle upgrade requests manually for proper path routing
    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);

      if (url.pathname.startsWith('/api/v1/ws')) {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
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
        documentation: config.ENABLE_API_DOCS
          ? `http://${config.HOST}:${config.PORT}/api-docs`
          : null,
      });
    });

    // Handle server errors
    server.on('error', (error) => {
      logger.error('Server error', { 
        error: error instanceof Error ? {
          ...error,
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error 
      });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', { 
      error: error instanceof Error ? {
        ...error,
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error 
    });
    process.exit(1);
  }
}

// Start the server
startServer();

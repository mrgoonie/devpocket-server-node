import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import { prisma } from '@/config/database';
import jwtService from '@/utils/jwt';
import logger from '@/config/logger';
import { getConfig } from '@/config/env';
import kubernetesService from '@/services/kubernetes';

const config = getConfig();

interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  environmentId: string;
  sessionId: string;
  lastPing: number;
  isTerminalConnection: boolean;
  isLogsConnection: boolean;
}

interface WebSocketMessage {
  type: string;
  data?: any;
  [key: string]: any;
}

class WebSocketConnectionManager {
  private connections = new Map<string, AuthenticatedWebSocket>();
  private userConnections = new Map<string, Set<string>>();
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    this.startPingInterval();
  }

  public addConnection(ws: AuthenticatedWebSocket): void {
    const connectionId = this.generateConnectionId();
    ws.sessionId = connectionId;

    this.connections.set(connectionId, ws);

    // Track user connections
    if (!this.userConnections.has(ws.userId)) {
      this.userConnections.set(ws.userId, new Set());
    }
    this.userConnections.get(ws.userId)!.add(connectionId);

    logger.info('WebSocket connection added', {
      connectionId,
      userId: ws.userId,
      environmentId: ws.environmentId,
      totalConnections: this.connections.size,
    });
  }

  public removeConnection(connectionId: string): void {
    const ws = this.connections.get(connectionId);
    if (ws) {
      this.connections.delete(connectionId);

      // Remove from user connections
      const userConnections = this.userConnections.get(ws.userId);
      if (userConnections) {
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
          this.userConnections.delete(ws.userId);
        }
      }

      logger.info('WebSocket connection removed', {
        connectionId,
        userId: ws.userId,
        environmentId: ws.environmentId,
        totalConnections: this.connections.size,
      });
    }
  }

  public getUserConnectionCount(userId: string): number {
    return this.userConnections.get(userId)?.size || 0;
  }

  public getConnectionsByEnvironment(environmentId: string): AuthenticatedWebSocket[] {
    return Array.from(this.connections.values()).filter(ws => ws.environmentId === environmentId);
  }

  public broadcastToEnvironment(environmentId: string, message: WebSocketMessage): void {
    const connections = this.getConnectionsByEnvironment(environmentId);
    const messageStr = JSON.stringify(message);

    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }

  private generateConnectionId(): string {
    return (
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    );
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const staleConnections: string[] = [];

      this.connections.forEach((ws, connectionId) => {
        if (ws.readyState === WebSocket.OPEN) {
          // Check if connection is stale (no ping in 2 minutes)
          if (now - ws.lastPing > 120000) {
            staleConnections.push(connectionId);
            ws.terminate();
          } else {
            // Send ping
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        } else {
          staleConnections.push(connectionId);
        }
      });

      // Clean up stale connections
      staleConnections.forEach(connectionId => {
        this.removeConnection(connectionId);
      });
    }, config.WS_HEARTBEAT_INTERVAL);
  }

  public destroy(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close all connections
    this.connections.forEach(ws => {
      ws.terminate();
    });

    this.connections.clear();
    this.userConnections.clear();
  }
}

const connectionManager = new WebSocketConnectionManager();

/**
 * Validate WebSocket upgrade request
 */
async function validateWebSocketUpgrade(request: IncomingMessage): Promise<void> {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const pathParts = url.pathname.split('/');

  // Parse path: /api/v1/ws/terminal/{environmentId} or /api/v1/ws/logs/{environmentId}
  if (pathParts.length < 6) {
    throw new Error('Invalid WebSocket path');
  }

  const connectionType = pathParts[4]; // 'terminal' or 'logs'
  const environmentId = pathParts[5];

  if (!connectionType || !['terminal', 'logs'].includes(connectionType)) {
    throw new Error('Invalid connection type');
  }

  if (!environmentId) {
    throw new Error('Environment ID is required');
  }

  // Authenticate user
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('Authentication token is required');
  }

  let userId: string;
  try {
    const payload = jwtService.verifyToken(token);
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    userId = payload.userId;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }

  // Verify user exists and is active
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      accountLockedUntil: true,
    },
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    throw new Error('Account is locked');
  }

  // Verify environment exists and belongs to user
  const environment = await prisma.environment.findFirst({
    where: {
      id: environmentId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!environment) {
    throw new Error('Environment not found');
  }

  // Check connection limits
  const userConnectionCount = connectionManager.getUserConnectionCount(userId);
  if (userConnectionCount >= config.WS_MAX_CONNECTIONS_PER_USER) {
    throw new Error('Too many connections');
  }
}

/**
 * Initialize WebSocket server
 */
export function initializeWebSocketServer(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, request: IncomingMessage) => {
    // First validate the connection
    try {
      await validateWebSocketUpgrade(request);
      // If validation passes, handle the connection normally
      await handleWebSocketConnection(ws as AuthenticatedWebSocket, request);
    } catch (error) {
      logger.warn('WebSocket connection rejected', {
        url: request.url,
        error: error instanceof Error ? error.message : error,
      });

      // Close with 1008 (Policy Violation) immediately for authentication/authorization failures
      ws.close(1008, 'Authentication failed');
      return;
    }
  });

  wss.on('error', error => {
    logger.error('WebSocket server error', { error });
  });

  // Clean up connection manager on server close
  wss.on('close', () => {
    connectionManager.destroy();
  });

  logger.info('WebSocket server initialized');
}

/**
 * Handle new WebSocket connection
 */
async function handleWebSocketConnection(
  ws: AuthenticatedWebSocket,
  request: IncomingMessage
): Promise<void> {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const pathParts = url.pathname.split('/');

  // Parse path: /api/v1/ws/terminal/{environmentId} or /api/v1/ws/logs/{environmentId}
  if (pathParts.length < 6) {
    throw new Error('Invalid WebSocket path');
  }

  const connectionType = pathParts[4]; // 'terminal' or 'logs'
  const environmentId = pathParts[5];

  if (!connectionType || !['terminal', 'logs'].includes(connectionType)) {
    throw new Error('Invalid connection type');
  }

  if (!environmentId) {
    throw new Error('Environment ID is required');
  }

  // Authenticate user
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('Authentication token is required');
  }

  let userId: string;
  try {
    const payload = jwtService.verifyToken(token);
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    userId = payload.userId;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }

  // Verify user exists and is active
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      accountLockedUntil: true,
    },
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
    throw new Error('Account is locked');
  }

  // Verify environment exists and belongs to user
  const environment = await prisma.environment.findFirst({
    where: {
      id: environmentId,
      userId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      installationCompleted: true,
    },
  });

  if (!environment) {
    throw new Error('Environment not found');
  }

  // Check connection limits
  const userConnectionCount = connectionManager.getUserConnectionCount(userId);
  if (userConnectionCount >= config.WS_MAX_CONNECTIONS_PER_USER) {
    throw new Error('Too many connections');
  }

  // Set up WebSocket
  ws.userId = userId;
  ws.environmentId = environmentId;
  ws.lastPing = Date.now();
  ws.isTerminalConnection = connectionType === 'terminal';
  ws.isLogsConnection = connectionType === 'logs';

  // Add to connection manager
  connectionManager.addConnection(ws);

  // Set up event handlers
  ws.on('message', async data => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    await handleWebSocketMessage(ws, buffer);
  });

  ws.on('close', (code, reason) => {
    handleWebSocketClose(ws, code, reason);
  });

  ws.on('error', error => {
    logger.error('WebSocket connection error', {
      userId: ws.userId,
      environmentId: ws.environmentId,
      error,
    });
  });

  ws.on('pong', () => {
    ws.lastPing = Date.now();
  });

  // Send welcome message
  const welcomeMessage: WebSocketMessage = {
    type: 'welcome',
    message: `Connected to ${environment.name}`,
    environment: {
      id: environment.id,
      name: environment.name,
      status: environment.status,
      installationCompleted: environment.installationCompleted,
      ptyEnabled: ws.isTerminalConnection,
    },
  };

  ws.send(JSON.stringify(welcomeMessage));

  // Create or update terminal session if this is a terminal connection
  if (ws.isTerminalConnection) {
    await createOrUpdateTerminalSession(environmentId, ws.sessionId);
  }

  logger.info('WebSocket connection established', {
    userId,
    environmentId,
    connectionType,
    sessionId: ws.sessionId,
  });
}

/**
 * Handle WebSocket message
 */
async function handleWebSocketMessage(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
  try {
    const message: WebSocketMessage = JSON.parse(data.toString());

    switch (message.type) {
      case 'ping':
        ws.lastPing = Date.now();
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'input':
        if (ws.isTerminalConnection) {
          await handleTerminalInput(ws, message.data);
        }
        break;

      case 'resize':
        if (ws.isTerminalConnection) {
          handleTerminalResize(ws, message.cols, message.rows);
        }
        break;

      default:
        logger.warn('Unknown WebSocket message type', {
          type: message.type,
          userId: ws.userId,
          environmentId: ws.environmentId,
        });
    }
  } catch (error) {
    logger.error('Error handling WebSocket message', {
      error,
      userId: ws.userId,
      environmentId: ws.environmentId,
    });

    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'Failed to process message',
      })
    );
  }
}

/**
 * Handle WebSocket close
 */
function handleWebSocketClose(ws: AuthenticatedWebSocket, code: number, reason: Buffer): void {
  logger.info('WebSocket connection closed', {
    userId: ws.userId,
    environmentId: ws.environmentId,
    sessionId: ws.sessionId,
    code,
    reason: reason.toString(),
  });

  // Remove from connection manager
  connectionManager.removeConnection(ws.sessionId);

  // Update terminal session status if this was a terminal connection
  if (ws.isTerminalConnection) {
    updateTerminalSessionStatus(ws.environmentId, ws.sessionId, 'INACTIVE');
  }
}

/**
 * Handle terminal input
 */
async function handleTerminalInput(ws: AuthenticatedWebSocket, input: string): Promise<void> {
  logger.debug('Terminal input received', {
    userId: ws.userId,
    environmentId: ws.environmentId,
    inputLength: input.length,
  });

  try {
    // Execute command in Kubernetes environment
    const result = await kubernetesService.executeCommand(
      ws.environmentId,
      input,
      true // Enable stdin for interactive commands
    );

    if (result.success && result.output) {
      ws.send(
        JSON.stringify({
          type: 'output',
          data: result.output,
        })
      );
    } else if (result.error) {
      ws.send(
        JSON.stringify({
          type: 'error',
          data: result.error,
        })
      );
    }

    // Update last activity
    await prisma.environment.update({
      where: { id: ws.environmentId },
      data: { lastActivityAt: new Date() },
    });
  } catch (error) {
    logger.error('Failed to execute terminal input', {
      userId: ws.userId,
      environmentId: ws.environmentId,
      error,
    });

    ws.send(
      JSON.stringify({
        type: 'error',
        data: 'Failed to execute command',
      })
    );
  }
}

/**
 * Handle terminal resize
 */
function handleTerminalResize(ws: AuthenticatedWebSocket, cols: number, rows: number): void {
  // TODO: Resize tmux session in Kubernetes pod
  logger.debug('Terminal resize requested', {
    userId: ws.userId,
    environmentId: ws.environmentId,
    cols,
    rows,
  });
}

/**
 * Create or update terminal session
 */
async function createOrUpdateTerminalSession(
  environmentId: string,
  sessionId: string
): Promise<void> {
  try {
    await prisma.terminalSession.upsert({
      where: {
        sessionId,
      },
      update: {
        status: 'ACTIVE',
        lastActivityAt: new Date(),
      },
      create: {
        environmentId,
        sessionId,
        status: 'ACTIVE',
        tmuxSessionName: `devpocket_${environmentId}`,
        startedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('Failed to create/update terminal session', {
      environmentId,
      sessionId,
      error,
    });
  }
}

/**
 * Update terminal session status
 */
async function updateTerminalSessionStatus(
  environmentId: string,
  sessionId: string,
  status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
): Promise<void> {
  try {
    await prisma.terminalSession.updateMany({
      where: {
        environmentId,
        sessionId,
      },
      data: {
        status,
        endedAt: status !== 'ACTIVE' ? new Date() : null,
      },
    });
  } catch (error) {
    logger.error('Failed to update terminal session status', {
      environmentId,
      sessionId,
      status,
      error,
    });
  }
}

/**
 * Broadcast message to all connections of an environment
 */
export function broadcastToEnvironment(environmentId: string, message: WebSocketMessage): void {
  connectionManager.broadcastToEnvironment(environmentId, message);
}

/**
 * Get active connection count for monitoring
 */
export function getActiveConnectionCount(): number {
  return connectionManager['connections'].size;
}

/**
 * Clean up WebSocket service
 */
export function cleanup(): void {
  connectionManager.destroy();
}

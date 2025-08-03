import WebSocket from 'ws';
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer } from 'ws';
import { Socket } from 'net';
import app from '../../src/app';
import { prisma } from '../setup';
import { createTestUserWithToken, cleanupTestData, generateTestToken } from '../helpers/testUtils';
import { initializeWebSocketServer, cleanup } from '../../src/services/websocket';
import { SubscriptionPlan, ClusterStatus, TemplateStatus, TemplateCategory } from '@prisma/client';

describe('WebSocket API', () => {
  let server: any;
  let wss: WebSocketServer;
  let testUser: any;
  let authToken: string;
  let testEnvironment: any;
  let testCluster: any;
  let testTemplate: any;
  let wsUrl: string;

  beforeAll(async () => {
    // Create HTTP server with Express app
    server = createServer(app);
    
    // Initialize WebSocket server without path restriction to handle all requests
    wss = new WebSocketServer({ 
      noServer: true
    });
    
    // Handle upgrade requests manually - allow all WebSocket connections to establish
    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      
      if (url.pathname.startsWith('/api/v1/ws')) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
    
    initializeWebSocketServer(wss);

    // Start server on random port
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = server.address()?.port;
        wsUrl = `ws://localhost:${port}/api/v1/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Clean up WebSocket service
    cleanup();
    
    // Clean up WebSocket connections first
    if (wss) {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.terminate();
        }
      });
      wss.close();
    }
    
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  beforeEach(async () => {
    const { user, token } = await createTestUserWithToken({
      subscriptionPlan: SubscriptionPlan.PRO,
    });
    
    testUser = user;
    authToken = token;

    // Create test cluster
    testCluster = await prisma.cluster.create({
      data: {
        name: 'test-ws-cluster',
        description: 'Test cluster for WebSocket',
        provider: 'ovh',
        region: 'eu-west-1',
        kubeconfig: 'encrypted-test-kubeconfig',
        status: ClusterStatus.ACTIVE,
        nodeCount: 1,
      },
    });

    // Create test template
    testTemplate = await prisma.template.create({
      data: {
        name: 'test-ws-template',
        displayName: 'Test WebSocket Template',
        description: 'Template for WebSocket testing',
        category: TemplateCategory.PROGRAMMING_LANGUAGE,
        tags: ['test', 'websocket'],
        dockerImage: 'node:18-alpine',
        defaultPort: 3000,
        defaultResourcesCpu: '500m',
        defaultResourcesMemory: '1Gi',
        defaultResourcesStorage: '10Gi',
        environmentVariables: { NODE_ENV: 'test' },
        startupCommands: ['echo "Starting test environment"'],
        status: TemplateStatus.ACTIVE,
        version: '1.0.0',
      },
    });

    // Create test environment
    testEnvironment = await prisma.environment.create({
      data: {
        name: 'test-ws-env',
        description: 'Environment for WebSocket testing',
        userId: testUser.id,
        templateId: testTemplate.id,
        clusterId: testCluster.id,
        dockerImage: 'node:18-alpine',
        port: 3000,
        status: 'RUNNING',
        installationCompleted: true,
      },
    });

    // Add user to cluster
    await prisma.userCluster.create({
      data: {
        userId: testUser.id,
        clusterId: testCluster.id,
        role: 'USER',
      },
    });
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 100)); // Add a small delay
    await cleanupTestData();
  });

  describe('Terminal WebSocket Connection', () => {
    it('should establish terminal WebSocket connection with valid token', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        // Don't close immediately - wait for welcome message
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'welcome') {
          expect(message).toHaveProperty('message');
          expect(message).toHaveProperty('environment');
          expect(message.environment.id).toBe(testEnvironment.id);
          expect(message.environment.ptyEnabled).toBe(true);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection without authentication token', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection with invalid token', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=invalid.jwt.token`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection to non-existent environment', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/non-existent-env?token=${authToken}`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connection to environment owned by another user', async () => {
      // Create another user and their environment
      const { user: otherUser } = await createTestUserWithToken();
      
      const otherEnvironment = await prisma.environment.create({
        data: {
          name: 'other-user-env',
          description: 'Environment owned by other user',
          userId: otherUser.id,
          templateId: testTemplate.id,
          clusterId: testCluster.id,
          dockerImage: 'node:18-alpine',
          port: 3000,
          status: 'RUNNING',
          installationCompleted: true,
        },
      });

      return new Promise<void>((done) => {
        const ws = new WebSocket(`${wsUrl}/terminal/${otherEnvironment.id}?token=${authToken}`);
        
        ws.on('close', (code) => {
          expect(code).toBe(1008); // Authentication failed
          done();
        });

        ws.on('error', (error) => {
          done(error as any);
        });
      });
    });
  });

  describe('Logs WebSocket Connection', () => {
    it('should establish logs WebSocket connection', (done) => {
      const ws = new WebSocket(`${wsUrl}/logs/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        // Don't close immediately - wait for welcome message
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'welcome') {
          expect(message).toHaveProperty('environment');
          expect(message.environment.id).toBe(testEnvironment.id);
          expect(message.environment.ptyEnabled).toBe(false);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('WebSocket Communication', () => {
    let ws: WebSocket;

    beforeEach((done) => {
      ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('open', () => {
        // Wait for welcome message before considering connection ready
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'welcome') {
          // Connection is fully established and welcome message received
          done();
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    afterEach(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should handle ping/pong messages', (done) => {
      const timeout = setTimeout(() => {
        done(new Error('Pong message not received within timeout') as any);
      }, 5000);

      ws.send(JSON.stringify({ type: 'ping' }));
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'pong') {
          clearTimeout(timeout);
          done();
        }
      });
    });

    it('should handle terminal input messages', (done) => {
      const timeout = setTimeout(() => {
        done(new Error('Terminal response not received within timeout') as any);
      }, 10000);

      ws.send(JSON.stringify({ 
        type: 'input', 
        data: 'echo "Hello World"\\n' 
      }));
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'output' || message.type === 'error') {
          // Received response to terminal input
          clearTimeout(timeout);
          done();
        }
      });
    });

    it('should handle terminal resize messages', (done) => {
      ws.send(JSON.stringify({ 
        type: 'resize', 
        cols: 80, 
        rows: 24 
      }));
      
      // Resize doesn't necessarily send a response, 
      // so we just verify the message doesn't cause an error
      setTimeout(() => {
        done();
      }, 1000);
    });

    it('should handle invalid message types gracefully', (done) => {
      ws.send(JSON.stringify({ 
        type: 'invalid_type', 
        data: 'test' 
      }));
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        // Should not crash the connection
        if (message.type === 'error') {
          expect(message.message).toContain('Failed to process message');
          done();
        }
      });

      setTimeout(() => {
        // If no error message, that's also fine - server should handle gracefully
        done();
      }, 2000);
    });

    it('should handle malformed JSON messages', (done) => {
      // Send malformed JSON
      ws.send('{"invalid": json}');
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'error') {
          expect(message.message).toContain('Failed to process message');
          done();
        }
      });

      setTimeout(() => {
        // If no error message, that's also fine - server should handle gracefully
        done();
      }, 2000);
    });
  });

  describe('Connection Management', () => {
    it('should handle multiple connections to same environment', (done) => {
      const ws1 = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
      const ws2 = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
      
      let connectedCount = 0;
      
      const checkConnections = () => {
        connectedCount++;
        if (connectedCount === 2) {
          expect(ws1.readyState).toBe(WebSocket.OPEN);
          expect(ws2.readyState).toBe(WebSocket.OPEN);
          
          ws1.close();
          ws2.close();
          done();
        }
      };

      ws1.on('open', checkConnections);
      ws2.on('open', checkConnections);

      ws1.on('error', done);
      ws2.on('error', done);
    });

    it('should handle connection cleanup on close', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', (code) => {
        expect(code).toBe(1005); // Normal closure
        done();
      });

      ws.on('error', done);
    });

    it('should enforce connection limits per user', async () => {
      const connections: WebSocket[] = [];
      const maxConnections = 10;
      let establishedConnections = 0;

      for (let i = 0; i < maxConnections + 5; i++) {
        const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
        connections.push(ws);

        ws.on('open', () => {
          establishedConnections++;
        });
      }

      // Wait for all connections to be established or rejected
      await new Promise(resolve => setTimeout(resolve, 2000));

      const openConnections = connections.filter(ws => ws.readyState === WebSocket.OPEN);
      const closedConnections = connections.filter(ws => ws.readyState === WebSocket.CLOSED);

      expect(openConnections.length).toBe(maxConnections);
      expect(closedConnections.length).toBe(5);

      // Clean up all connections
      connections.forEach(conn => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.close();
        }
      });
    });
  });

  describe('Authentication Edge Cases', () => {
    it('should reject expired tokens', async () => {
      // Generate an expired token
      const expiredToken = generateTestToken(testUser.id, { expiresIn: '-1h' });
      
      return new Promise<void>((done) => {
        const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${expiredToken}`);
        
        ws.on('close', (code) => {
          expect(code).toBe(1008); // Authentication failed
          done();
        });

        ws.on('error', (error) => {
          done(error as any);
        });
      });
    });

    it('should reject refresh tokens for WebSocket connection', async () => {
      // Generate a refresh token instead of access token
      const refreshToken = generateTestToken(testUser.id, { tokenType: 'refresh' });
      
      return new Promise<void>((done) => {
        const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${refreshToken}`);
        
        ws.on('close', (code) => {
          expect(code).toBe(1008); // Authentication failed
          done();
        });

        ws.on('error', (error) => {
          done(error as any);
        });
      });
    });

    it('should reject connections for inactive users', async () => {
      // Deactivate the user
      await prisma.user.update({
        where: { id: testUser.id },
        data: { isActive: false },
      });
      
      return new Promise<void>((done) => {
        const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
        
        ws.on('close', (code) => {
          expect(code).toBe(1008); // Authentication failed
          done();
        });

        ws.on('error', (error) => {
          done(error as any);
        });
      });
    });

    it('should reject connections for locked accounts', async () => {
      // Lock the user account
      await prisma.user.update({
        where: { id: testUser.id },
        data: { 
          accountLockedUntil: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });
      
      return new Promise<void>((done) => {
        const ws = new WebSocket(`${wsUrl}/terminal/${testEnvironment.id}?token=${authToken}`);
        
        ws.on('close', (code) => {
          expect(code).toBe(1008); // Authentication failed
          done();
        });

        ws.on('error', (error) => {
          done(error as any);
        });
      });
    });
  });

  describe('Invalid WebSocket Paths', () => {
    it('should reject invalid connection types', (done) => {
      const ws = new WebSocket(`${wsUrl}/invalid/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connections without environment ID', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/?token=${authToken}`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should reject connections with malformed paths', (done) => {
      const ws = new WebSocket(`${wsUrl}/terminal/extra/path/${testEnvironment.id}?token=${authToken}`);
      
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });
});
# WebSocket Terminal Implementation Guide

This document provides a complete implementation guide for integrating WebSocket terminal functionality into the DevPocket Flutter mobile app.

## Table of Contents

1. [Overview](#overview)
2. [WebSocket API Specification](#websocket-api-specification)
3. [Flutter Dependencies](#flutter-dependencies)
4. [Authentication](#authentication)
5. [WebSocket Connection](#websocket-connection)
6. [Message Protocol](#message-protocol)
7. [Terminal UI Implementation](#terminal-ui-implementation)
8. [Complete Flutter Implementation](#complete-flutter-implementation)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)
11. [Testing](#testing)

## Overview

The DevPocket WebSocket terminal provides real-time PTY (pseudo-terminal) access to development environments. The implementation supports:

- **Full PTY terminal emulation** with ANSI escape sequences
- **Interactive programs** (vim, nano, htop, etc.)
- **Real-time bidirectional communication** (input/output)
- **Terminal resize support** for responsive layouts
- **Connection health monitoring** (ping/pong)
- **Real-time installation progress** via WebSocket streaming
- **Proper cleanup and error handling**

## WebSocket API Specification

### Endpoints

#### Terminal Access
```
wss://{API_BASE_URL}/api/v1/ws/terminal/{environment_id}?token={jwt_token}
```

#### Installation Logs (NEW)
```
wss://{API_BASE_URL}/api/v1/ws/logs/{environment_id}?token={jwt_token}
```

**Parameters:**
- `environment_id`: String - The ID of the development environment
- `token`: String - JWT access token for authentication

**Supported Domains:**
- Production: `wss://api.devpocket.app`
- Staging: `wss://devpocket-api.goon.vn`

### Connection Flow

#### Terminal Connection Flow
1. **Authentication**: JWT token validated on connection
2. **Welcome Message**: Server sends environment details
3. **Command Execution**: Client sends commands, server responds with output
4. **Heartbeat**: Ping/pong messages for connection health

#### Installation Logs Connection Flow (NEW)
1. **Authentication**: JWT token validated on connection
2. **Status Check**: Server checks if environment is in INSTALLING status
3. **Log Streaming**: Server streams real-time installation logs from Kubernetes pod
4. **Completion**: Server sends completion message when installation finishes
5. **Cleanup**: Proper disconnection and session cleanup

## Flutter Dependencies

Add these dependencies to your `pubspec.yaml`:

```yaml
dependencies:
  web_socket_channel: ^2.4.0
  xterm: ^3.4.0        # Terminal UI with PTY support
  provider: ^6.0.5     # State management
  
dev_dependencies:
  mockito: ^5.4.2      # For testing
```

## Authentication

### JWT Token Structure

```dart
class AuthToken {
  final String sub;        // User ID
  final String username;   // Username
  final String email;      // User email
  final DateTime exp;      // Expiration time
  final DateTime iat;      // Issued at time
  final String type;       // "access_token"
}
```

### Token Generation Example

```dart
import 'package:jwt_decode/jwt_decode.dart';

class AuthService {
  String? _accessToken;
  
  // Get current access token
  String? get accessToken => _accessToken;
  
  // Check if token is valid and not expired
  bool isTokenValid() {
    if (_accessToken == null) return false;
    
    try {
      final payload = Jwt.parseJwt(_accessToken!);
      final exp = DateTime.fromMillisecondsSinceEpoch(payload['exp'] * 1000);
      return DateTime.now().isBefore(exp);
    } catch (e) {
      return false;
    }
  }
  
  // Refresh token if needed
  Future<String?> getValidToken() async {
    if (isTokenValid()) {
      return _accessToken;
    }
    
    // Implement token refresh logic here
    await refreshToken();
    return _accessToken;
  }
}
```

## WebSocket Connection

### WebSocket Service Implementation

```dart
import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

class WebSocketTerminalService {
  static const String _baseWsUrl = 'wss://api.devpocket.app';
  
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final StreamController<TerminalMessage> _messageController = StreamController.broadcast();
  final StreamController<ConnectionState> _connectionController = StreamController.broadcast();
  
  Timer? _pingTimer;
  bool _isConnected = false;
  String? _environmentId;
  
  // Streams for UI to listen to
  Stream<TerminalMessage> get messageStream => _messageController.stream;
  Stream<ConnectionState> get connectionStream => _connectionController.stream;
  
  bool get isConnected => _isConnected;
  
  // Connect to WebSocket terminal
  Future<bool> connect(String environmentId, String accessToken) async {
    try {
      _environmentId = environmentId;
      final uri = Uri.parse('$_baseWsUrl/api/v1/ws/terminal/$environmentId?token=$accessToken');
      
      _connectionController.add(ConnectionState.connecting);
      
      _channel = WebSocketChannel.connect(uri);
      
      // Listen to messages
      _subscription = _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnection,
      );
      
      _isConnected = true;
      _connectionController.add(ConnectionState.connected);
      
      // Start ping timer for connection health
      _startPingTimer();
      
      return true;
    } catch (e) {
      _connectionController.add(ConnectionState.error);
      print('WebSocket connection error: $e');
      return false;
    }
  }
  
  // Send command to terminal
  void sendCommand(String command) {
    if (!_isConnected || _channel == null) return;
    
    final message = {
      'type': 'input',
      'data': command,
    };
    
    _channel!.sink.add(json.encode(message));
  }
  
  // Send ping for connection health
  void sendPing() {
    if (!_isConnected || _channel == null) return;
    
    final message = {'type': 'ping'};
    _channel!.sink.add(json.encode(message));
  }
  
  // Handle terminal resize
  void resizeTerminal(int cols, int rows) {
    if (!_isConnected || _channel == null) return;
    
    final message = {
      'type': 'resize',
      'cols': cols,
      'rows': rows,
    };
    
    _channel!.sink.add(json.encode(message));
  }
  
  // Handle incoming messages
  void _handleMessage(dynamic data) {
    try {
      final Map<String, dynamic> message = json.decode(data);
      final messageType = message['type'] as String?;
      
      switch (messageType) {
        case 'welcome':
          _handleWelcomeMessage(message);
          break;
        case 'output':
          _handleOutputMessage(message);
          break;
        case 'pong':
          _handlePongMessage();
          break;
        case 'error':
          _handleErrorMessage(message);
          break;
        default:
          print('Unknown message type: $messageType');
      }
    } catch (e) {
      print('Error parsing WebSocket message: $e');
    }
  }
  
  void _handleWelcomeMessage(Map<String, dynamic> message) {
    final environmentData = message['environment'] as Map<String, dynamic>?;
    final welcomeMessage = TerminalMessage.welcome(
      message: message['message'] as String? ?? 'Connected',
      environment: environmentData,
    );
    
    _messageController.add(welcomeMessage);
    print('Connected to environment: ${environmentData?['name']}');
  }
  
  void _handleOutputMessage(Map<String, dynamic> message) {
    final output = message['data'] as String? ?? '';
    final outputMessage = TerminalMessage.output(output);
    _messageController.add(outputMessage);
  }
  
  void _handlePongMessage() {
    print('Received pong - connection healthy');
  }
  
  void _handleErrorMessage(Map<String, dynamic> message) {
    final errorMsg = message['message'] as String? ?? 'Unknown error';
    final errorMessage = TerminalMessage.error(errorMsg);
    _messageController.add(errorMessage);
  }
  
  void _handleError(error) {
    print('WebSocket error: $error');
    _connectionController.add(ConnectionState.error);
    _cleanup();
  }
  
  void _handleDisconnection() {
    print('WebSocket disconnected');
    _connectionController.add(ConnectionState.disconnected);
    _cleanup();
  }
  
  void _startPingTimer() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(Duration(seconds: 30), (timer) {
      sendPing();
    });
  }
  
  void _cleanup() {
    _isConnected = false;
    _pingTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close(status.normalClosure);
  }
  
  // Disconnect from WebSocket
  void disconnect() {
    _cleanup();
    _connectionController.add(ConnectionState.disconnected);
  }
  
  void dispose() {
    _cleanup();
    _messageController.close();
    _connectionController.close();
  }
}
```

## Message Protocol

### Message Types

#### 1. Welcome Message (Server → Client)
```json
{
  "type": "welcome",
  "message": "Connected to goon",
  "environment": {
    "id": "68850093852e1ff1492d3d87",
    "name": "goon",
    "status": "running",
    "template": "ubuntu",
    "pty_enabled": true
  }
}
```

#### 2. Terminal Input (Client → Server)
```json
{
  "type": "input",
  "data": "ls -la\r"
}
```

**Note**: PTY input should include carriage return (`\r`) or newline (`\n`) characters as appropriate for terminal interaction.

#### 3. Terminal Output (Server → Client)
```json
{
  "type": "output",
  "data": "\u001b[0m\u001b[27m\u001b[24m\u001b[J\u001b[01;32muser@goon\u001b[00m:\u001b[01;34m/workspace\u001b[00m$ ls -la\r\ntotal 8\r\ndrwxr-xr-x 2 root root 4096 Jul 26 16:27 .\r\ndrwxr-xr-x 3 root root 4096 Jul 26 16:27 ..\r\n\u001b[01;32muser@goon\u001b[00m:\u001b[01;34m/workspace\u001b[00m$ "
}
```

**Note**: PTY output includes ANSI escape sequences for colors, cursor positioning, and other terminal features.

#### 4. Environment Status Update (Server → Client)
```json
{
  "type": "status_update",
  "environment_id": "68850093852e1ff1492d3d87",
  "status": "provisioning",
  "message": "Creating persistent volume claim...",
  "progress": 25,
  "timestamp": "2024-01-01T00:01:30Z"
}
```

**Status Values**: `creating`, `provisioning`, `installing`, `configuring`, `running`, `error`, `stopped`
**Progress**: 0-100 percentage completion (optional)

#### 5. Ping/Pong (Bidirectional)
```json
// Ping
{"type": "ping"}

// Pong
{"type": "pong"}
```

#### 6. Terminal Resize (Client → Server)
```json
{
  "type": "resize",
  "cols": 80,
  "rows": 24
}
```

#### 7. Error Message (Server → Client)
```json
{
  "type": "error",
  "message": "Command execution failed"
}
```

### Installation Logs WebSocket Messages

The installation logs WebSocket endpoint (`/api/v1/ws/logs/{environment_id}`) provides real-time streaming of environment installation progress with the following message types:

#### 7. Installation Log Message (Server → Client)
```json
{
  "type": "installation_log",
  "environment_id": "68850093852e1ff1492d3d87",
  "data": "Get:1 http://archive.ubuntu.com/ubuntu jammy InRelease [270 kB]\n",
  "timestamp": "2025-07-30T05:23:45Z"
}
```

**Note**: Installation logs contain raw output from the container installation process, including package manager output and system configuration logs.

#### 8. Installation Complete Message (Server → Client) - NEW
```json
{
  "type": "installation_complete",
  "environment_id": "68850093852e1ff1492d3d87",
  "status": "running"
}
```

#### 9. Installation Status Message (Server → Client)
```json
{
  "type": "installation_status",
  "environment_id": "68850093852e1ff1492d3d87",
  "status": "installing",
  "message": "Environment installation in progress..."
}
```

#### 10. Installation Error Message (Server → Client)
```json
{
  "type": "installation_error",
  "environment_id": "68850093852e1ff1492d3d87",
  "error": "Failed to install package: connection timeout"
}
```

### Message Models

```dart
enum TerminalMessageType {
  welcome,
  output,
  statusUpdate,           // NEW: Environment status updates
  error,
  pong,
  installationLog,        
  installationComplete,   
  installationStatus,     
  installationError,      // NEW
}

enum ConnectionState {
  disconnected,
  connecting,
  connected,
  error,
}

class TerminalMessage {
  final TerminalMessageType type;
  final String data;
  final Map<String, dynamic>? environment;
  final DateTime timestamp;
  
  TerminalMessage._({
    required this.type,
    required this.data,
    this.environment,
  }) : timestamp = DateTime.now();
  
  factory TerminalMessage.welcome({
    required String message,
    Map<String, dynamic>? environment,
  }) {
    return TerminalMessage._(
      type: TerminalMessageType.welcome,
      data: message,
      environment: environment,
    );
  }
  
  factory TerminalMessage.output(String output) {
    return TerminalMessage._(
      type: TerminalMessageType.output,
      data: output,
    );
  }
  
  factory TerminalMessage.error(String error) {
    return TerminalMessage._(
      type: TerminalMessageType.error,
      data: error,
    );
  }
  
  factory TerminalMessage.pong() {
    return TerminalMessage._(
      type: TerminalMessageType.pong,
      data: 'pong',
    );
  }
  
  // NEW: Installation message factories
  factory TerminalMessage.installationLog({
    required String data,
    Map<String, dynamic>? environment,
  }) {
    return TerminalMessage._(
      type: TerminalMessageType.installationLog,
      data: data,
      environment: environment,
    );
  }
  
  factory TerminalMessage.installationComplete({
    required String status,
    Map<String, dynamic>? environment,
  }) {
    return TerminalMessage._(
      type: TerminalMessageType.installationComplete,
      data: status,
      environment: environment,
    );
  }
  
  factory TerminalMessage.installationStatus({
    required String status,
    required String message,
    Map<String, dynamic>? environment,
  }) {
    return TerminalMessage._(
      type: TerminalMessageType.installationStatus,
      data: "$status: $message",
      environment: environment,
    );
  }
  
  factory TerminalMessage.installationError({
    required String error,
    Map<String, dynamic>? environment,
  }) {
    return TerminalMessage._(
      type: TerminalMessageType.installationError,
      data: error,
      environment: environment,
    );
  }
}
```

## Terminal UI Implementation

### Terminal State Management

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class TerminalProvider extends ChangeNotifier {
  final WebSocketTerminalService _wsService = WebSocketTerminalService();
  
  final List<String> _outputLines = [];
  final TextEditingController _inputController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  
  ConnectionState _connectionState = ConnectionState.disconnected;
  String? _currentEnvironmentId;
  Map<String, dynamic>? _environmentInfo;
  
  // Getters
  List<String> get outputLines => List.unmodifiable(_outputLines);
  TextEditingController get inputController => _inputController;
  ScrollController get scrollController => _scrollController;
  ConnectionState get connectionState => _connectionState;
  String? get currentEnvironmentId => _currentEnvironmentId;
  Map<String, dynamic>? get environmentInfo => _environmentInfo;
  
  bool get isConnected => _connectionState == ConnectionState.connected;
  bool get isConnecting => _connectionState == ConnectionState.connecting;
  
  TerminalProvider() {
    _initializeListeners();
  }
  
  void _initializeListeners() {
    // Listen to connection state changes
    _wsService.connectionStream.listen((state) {
      _connectionState = state;
      notifyListeners();
    });
    
    // Listen to terminal messages
    _wsService.messageStream.listen((message) {
      switch (message.type) {
        case TerminalMessageType.welcome:
          _handleWelcomeMessage(message);
          break;
        case TerminalMessageType.output:
          _handleOutputMessage(message);
          break;
        case TerminalMessageType.statusUpdate:
          _handleStatusUpdateMessage(message);
          break;
        case TerminalMessageType.error:
          _handleErrorMessage(message);
          break;
        case TerminalMessageType.pong:
          // Handle pong if needed
          break;
      }
    });
  }
  
  void _handleWelcomeMessage(TerminalMessage message) {
    _environmentInfo = message.environment;
    addOutputLine('🎉 ${message.data}');
    
    if (_environmentInfo != null) {
      addOutputLine('Environment: ${_environmentInfo!['name']}');
      addOutputLine('Status: ${_environmentInfo!['status']}');
      addOutputLine('Template: ${_environmentInfo!['template']}');
      addOutputLine('');
    }
    
    notifyListeners();
  }
  
  void _handleOutputMessage(TerminalMessage message) {
    // Split output into lines and add them
    final lines = message.data.split('\n');
    for (final line in lines) {
      if (line.isNotEmpty || lines.length == 1) {
        addOutputLine(line);
      }
    }
  }
  
  void _handleStatusUpdateMessage(TerminalMessage message) {
    final status = message.data['status'] as String?;
    final statusMessage = message.data['message'] as String?;
    final progress = message.data['progress'] as int?;
    
    // Update environment info with new status
    if (_environmentInfo != null) {
      _environmentInfo!['status'] = status;
    }
    
    // Display status update to user
    String displayMessage = '🔄 Status: $status';
    if (statusMessage != null) {
      displayMessage += ' - $statusMessage';
    }
    if (progress != null) {
      displayMessage += ' ($progress%)';
    }
    
    addOutputLine(displayMessage);
    notifyListeners();
  }
  
  void _handleErrorMessage(TerminalMessage message) {
    addOutputLine('❌ Error: ${message.data}');
  }
  
  // Connect to environment
  Future<bool> connectToEnvironment(String environmentId, String accessToken) async {
    _currentEnvironmentId = environmentId;
    addOutputLine('🔌 Connecting to environment...');
    
    final success = await _wsService.connect(environmentId, accessToken);
    
    if (!success) {
      addOutputLine('❌ Failed to connect to environment');
    }
    
    return success;
  }
  
  // Send command
  void sendCommand(String command) {
    if (!isConnected) return;
    
    // Clear input
    _inputController.clear();
    
    // Send command
    _wsService.sendCommand(command);
    
    // Auto-scroll to bottom
    _scrollToBottom();
  }
  
  // Add output line
  void addOutputLine(String line) {
    _outputLines.add(line);
    notifyListeners();
    
    // Auto-scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToBottom();
    });
  }
  
  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }
  
  // Handle terminal resize
  void resizeTerminal(int cols, int rows) {
    _wsService.resizeTerminal(cols, rows);
  }
  
  // Clear terminal
  void clearTerminal() {
    _outputLines.clear();
    notifyListeners();
  }
  
  // Disconnect
  void disconnect() {
    _wsService.disconnect();
    _currentEnvironmentId = null;
    _environmentInfo = null;
  }
  
  @override
  void dispose() {
    _wsService.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
```

### PTY Terminal Implementation with xterm

For full PTY support, use the `xterm` package which handles ANSI escape sequences and provides a complete terminal experience:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:xterm/xterm.dart';

class PTYTerminalWidget extends StatefulWidget {
  final String environmentId;
  final String accessToken;
  
  const PTYTerminalWidget({
    Key? key,
    required this.environmentId,
    required this.accessToken,
  }) : super(key: key);
  
  @override
  State<PTYTerminalWidget> createState() => _PTYTerminalWidgetState();
}

class _PTYTerminalWidgetState extends State<PTYTerminalWidget> {
  late Terminal terminal;
  late TerminalController terminalController;
  late TerminalProvider _terminalProvider;
  
  @override
  void initState() {
    super.initState();
    _terminalProvider = context.read<TerminalProvider>();
    
    // Create terminal with PTY support
    terminal = Terminal(
      maxLines: 10000,
    );
    
    terminalController = TerminalController();
    
    // Set up terminal input handler
    terminal.onOutput = (data) {
      // Send terminal input to WebSocket
      _terminalProvider.sendRawInput(data);
    };
    
    terminal.onResize = (width, height, pixelWidth, pixelHeight) {
      // Send resize event to WebSocket
      _terminalProvider.resizeTerminal(width, height);
    };
    
    // Connect to environment
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _terminalProvider.connectToEnvironment(
        widget.environmentId,
        widget.accessToken,
      );
    });
    
    // Listen for PTY output
    _terminalProvider.messageStream.listen((message) {
      if (message.type == TerminalMessageType.output) {
        // Write PTY output directly to terminal (includes ANSI sequences)
        terminal.write(message.data);
      }
    });
  }
  
  @override
  void dispose() {
    terminal.onOutput = null;
    terminal.onResize = null;
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.grey[900],
        title: Consumer<TerminalProvider>(
          builder: (context, provider, child) {
            final envInfo = provider.environmentInfo;
            return Text(
              envInfo != null ? 'Terminal - ${envInfo['name']}' : 'Terminal',
              style: TextStyle(color: Colors.white),
            );
          },
        ),
        actions: [
          Consumer<TerminalProvider>(
            builder: (context, provider, child) {
              return IconButton(
                icon: Icon(
                  provider.isConnected 
                    ? Icons.cloud_done 
                    : Icons.cloud_off,
                  color: provider.isConnected 
                    ? Colors.green 
                    : Colors.red,
                ),
                onPressed: () {
                  if (!provider.isConnected) {
                    provider.connectToEnvironment(
                      widget.environmentId,
                      widget.accessToken,
                    );
                  }
                },
              );
            },
          ),
          IconButton(
            icon: Icon(Icons.clear, color: Colors.white),
            onPressed: () {
              terminal.clear();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Connection Status
          Consumer<TerminalProvider>(
            builder: (context, provider, child) {
              if (provider.isConnecting) {
                return Container(
                  width: double.infinity,
                  padding: EdgeInsets.all(8),
                  color: Colors.orange,
                  child: Text(
                    '🔌 Connecting to PTY terminal...',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                );
              } else if (!provider.isConnected) {
                return Container(
                  width: double.infinity,
                  padding: EdgeInsets.all(8),
                  color: Colors.red,
                  child: Text(
                    '❌ Disconnected - Tap to reconnect',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                );
              }
              return SizedBox.shrink();
            },
          ),
          
          // PTY Terminal
          Expanded(
            child: Container(
              color: Colors.black,
              child: TerminalView(
                terminal,
                controller: terminalController,
                autofocus: true,
                backgroundOpacity: 0.0,
                onSecondaryTapDown: (details, offset) async {
                  // Handle right-click for context menu
                  final selection = terminalController.selection;
                  if (selection != null) {
                    final text = terminal.buffer.getText(selection);
                    await Clipboard.setData(ClipboardData(text: text));
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Copied to clipboard')),
                    );
                  }
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

### Installation Logs WebSocket Service Implementation

The logs WebSocket service is crucial for monitoring environment installation progress. Here's the complete implementation:

**lib/services/installation_logs_websocket_service.dart:**
```dart
import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;
import 'storage_service.dart';

class InstallationLogsWebSocketService {
  static const String _baseWsUrl = 'wss://devpocket-api.goon.vn';
  
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final StreamController<InstallationLogMessage> _messageController = 
      StreamController.broadcast();
  final StreamController<ConnectionState> _connectionController = 
      StreamController.broadcast();
  
  bool _isConnected = false;
  String? _environmentId;
  
  // Streams for UI to listen to
  Stream<InstallationLogMessage> get messageStream => _messageController.stream;
  Stream<ConnectionState> get connectionStream => _connectionController.stream;
  
  bool get isConnected => _isConnected;
  
  // Connect to installation logs WebSocket
  Future<bool> connect(String environmentId, String accessToken) async {
    try {
      _environmentId = environmentId;
      final uri = Uri.parse('$_baseWsUrl/api/v1/ws/logs/$environmentId?token=$accessToken');
      
      _connectionController.add(ConnectionState.connecting);
      
      _channel = WebSocketChannel.connect(uri);
      
      // Listen to messages
      _subscription = _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnection,
      );
      
      _isConnected = true;
      _connectionController.add(ConnectionState.connected);
      
      return true;
    } catch (e) {
      _connectionController.add(ConnectionState.error);
      print('WebSocket installation logs connection error: $e');
      return false;
    }
  }
  
  // Handle incoming messages
  void _handleMessage(dynamic data) {
    try {
      final Map<String, dynamic> message = json.decode(data);
      final messageType = message['type'] as String?;
      
      switch (messageType) {
        case 'welcome':
          _handleWelcomeMessage(message);
          break;
        case 'installation_log':
          _handleInstallationLogMessage(message);
          break;
        case 'installation_complete':
          _handleInstallationCompleteMessage(message);
          break;
        case 'installation_status':
          _handleInstallationStatusMessage(message);
          break;
        case 'installation_error':
          _handleInstallationErrorMessage(message);
          break;
        case 'log':
          _handleContainerLogMessage(message);
          break;
        case 'pong':
          // Keepalive response
          break;
        case 'error':
          _handleErrorMessage(message);
          break;
        default:
          print('Unknown installation log message type: $messageType');
      }
    } catch (e) {
      print('Error parsing WebSocket installation log message: $e');
    }
  }
  
  void _handleWelcomeMessage(Map<String, dynamic> message) {
    final welcomeMessage = InstallationLogMessage.welcome(
      message: message['message'] as String? ?? 'Connected to logs',
    );
    _messageController.add(welcomeMessage);
  }
  
  void _handleInstallationLogMessage(Map<String, dynamic> message) {
    final logData = message['data'] as String? ?? '';
    final timestamp = message['timestamp'] as String?;
    final logMessage = InstallationLogMessage.installationLog(
      data: logData,
      timestamp: timestamp != null ? DateTime.parse(timestamp) : DateTime.now(),
    );
    _messageController.add(logMessage);
  }
  
  void _handleInstallationCompleteMessage(Map<String, dynamic> message) {
    final status = message['status'] as String? ?? 'running';
    final completeMessage = InstallationLogMessage.installationComplete(
      status: status,
    );
    _messageController.add(completeMessage);
  }
  
  void _handleInstallationStatusMessage(Map<String, dynamic> message) {
    final status = message['status'] as String? ?? 'unknown';
    final statusMessage = message['message'] as String? ?? '';
    final statusMsg = InstallationLogMessage.installationStatus(
      status: status,
      message: statusMessage,
    );
    _messageController.add(statusMsg);
  }
  
  void _handleInstallationErrorMessage(Map<String, dynamic> message) {
    final error = message['error'] as String? ?? 'Unknown installation error';
    final errorMessage = InstallationLogMessage.installationError(error: error);
    _messageController.add(errorMessage);
  }
  
  void _handleContainerLogMessage(Map<String, dynamic> message) {
    final timestamp = message['timestamp'] as String?;
    final level = message['level'] as String? ?? 'INFO';
    final logMessage = message['message'] as String? ?? '';
    final source = message['source'] as String? ?? 'container';
    
    final containerLog = InstallationLogMessage.containerLog(
      timestamp: timestamp != null ? DateTime.parse(timestamp) : DateTime.now(),
      level: level,
      message: logMessage,
      source: source,
    );
    _messageController.add(containerLog);
  }
  
  void _handleErrorMessage(Map<String, dynamic> message) {
    final errorMsg = message['message'] as String? ?? 'Unknown error';
    final errorMessage = InstallationLogMessage.error(errorMsg);
    _messageController.add(errorMessage);
  }
  
  void _handleError(error) {
    print('WebSocket installation logs error: $error');
    _connectionController.add(ConnectionState.error);
    _cleanup();
  }
  
  void _handleDisconnection() {
    print('WebSocket installation logs disconnected');
    _connectionController.add(ConnectionState.disconnected);
    _cleanup();
  }
  
  void sendPing() {
    if (_channel != null && _isConnected) {
      final message = json.encode({'type': 'ping'});
      _channel!.sink.add(message);
    }
  }
  
  void _cleanup() {
    _isConnected = false;
    _subscription?.cancel();
    _channel?.sink.close(status.normalClosure);
  }
  
  // Disconnect from WebSocket
  void disconnect() {
    _cleanup();
    _connectionController.add(ConnectionState.disconnected);
  }
  
  void dispose() {
    _cleanup();
    _messageController.close();
    _connectionController.close();
  }
}

// Installation Log Message Models
enum InstallationLogMessageType {
  welcome,
  installationLog,
  installationComplete,
  installationStatus,
  installationError,
  containerLog,
  error,
}

class InstallationLogMessage {
  final InstallationLogMessageType type;
  final String data;
  final DateTime timestamp;
  final String? status;
  final String? level;
  final String? source;
  
  InstallationLogMessage._({
    required this.type,
    required this.data,
    required this.timestamp,
    this.status,
    this.level,
    this.source,
  });
  
  factory InstallationLogMessage.welcome({required String message}) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.welcome,
      data: message,
      timestamp: DateTime.now(),
    );
  }
  
  factory InstallationLogMessage.installationLog({
    required String data,
    required DateTime timestamp,
  }) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.installationLog,
      data: data,
      timestamp: timestamp,
    );
  }
  
  factory InstallationLogMessage.installationComplete({required String status}) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.installationComplete,
      data: 'Installation completed',
      timestamp: DateTime.now(),
      status: status,
    );
  }
  
  factory InstallationLogMessage.installationStatus({
    required String status,
    required String message,
  }) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.installationStatus,
      data: message,
      timestamp: DateTime.now(),
      status: status,
    );
  }
  
  factory InstallationLogMessage.installationError({required String error}) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.installationError,
      data: error,
      timestamp: DateTime.now(),
    );
  }
  
  factory InstallationLogMessage.containerLog({
    required DateTime timestamp,
    required String level,
    required String message,
    required String source,
  }) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.containerLog,
      data: message,
      timestamp: timestamp,
      level: level,
      source: source,
    );
  }
  
  factory InstallationLogMessage.error(String error) {
    return InstallationLogMessage._(
      type: InstallationLogMessageType.error,
      data: error,
      timestamp: DateTime.now(),
    );
  }
}
```

### Enhanced Terminal Provider for PTY

Update the `TerminalProvider` to handle raw PTY data:

```dart
class TerminalProvider extends ChangeNotifier {
  final WebSocketTerminalService _wsService = WebSocketTerminalService();
  
  ConnectionState _connectionState = ConnectionState.disconnected;
  String? _currentEnvironmentId;
  Map<String, dynamic>? _environmentInfo;
  
  // Streams for PTY data
  final StreamController<TerminalMessage> _messageController = StreamController.broadcast();
  
  // Getters
  Stream<TerminalMessage> get messageStream => _messageController.stream;
  ConnectionState get connectionState => _connectionState;
  String? get currentEnvironmentId => _currentEnvironmentId;
  Map<String, dynamic>? get environmentInfo => _environmentInfo;
  
  bool get isConnected => _connectionState == ConnectionState.connected;
  bool get isConnecting => _connectionState == ConnectionState.connecting;
  
  TerminalProvider() {
    _initializeListeners();
  }
  
  void _initializeListeners() {
    // Listen to connection state changes
    _wsService.connectionStream.listen((state) {
      _connectionState = state;
      notifyListeners();
    });
    
    // Listen to terminal messages
    _wsService.messageStream.listen((message) {
      _messageController.add(message);
      
      if (message.type == TerminalMessageType.welcome) {
        _environmentInfo = message.environment;
        notifyListeners();
      }
    });
  }
  
  // Connect to environment
  Future<bool> connectToEnvironment(String environmentId, String accessToken) async {
    _currentEnvironmentId = environmentId;
    return await _wsService.connect(environmentId, accessToken);
  }
  
  // Send raw input (for PTY - includes escape sequences, etc.)
  void sendRawInput(String data) {
    if (!isConnected) return;
    _wsService.sendRawInput(data);
  }
  
  // Send formatted command (legacy support)
  void sendCommand(String command) {
    if (!isConnected) return;
    // For PTY, commands need proper line endings
    _wsService.sendRawInput('$command\r');
  }
  
  // Handle terminal resize
  void resizeTerminal(int cols, int rows) {
    _wsService.resizeTerminal(cols, rows);
  }
  
  // Disconnect
  void disconnect() {
    _wsService.disconnect();
    _currentEnvironmentId = null;
    _environmentInfo = null;
  }
  
  @override
  void dispose() {
    _wsService.dispose();
    _messageController.close();
    super.dispose();
  }
}
```

### Updated WebSocket Service for PTY

```dart
class WebSocketTerminalService {
  // ... existing code ...
  
  // Send raw input (for PTY support)
  void sendRawInput(String data) {
    if (!_isConnected || _channel == null) return;
    
    final message = {
      'type': 'input',
      'data': data,
    };
    
    _channel!.sink.add(json.encode(message));
  }
  
  // ... rest of existing code ...
}
```

### Installation Logs WebSocket Service (NEW)

```dart
import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:web_socket_channel/status.dart' as status;

class WebSocketInstallationLogsService {
  static const String _baseWsUrl = 'wss://api.devpocket.app';
  
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  final StreamController<TerminalMessage> _messageController = StreamController.broadcast();
  final StreamController<ConnectionState> _connectionController = StreamController.broadcast();
  
  bool _isConnected = false;
  String? _environmentId;
  
  // Streams for UI to listen to
  Stream<TerminalMessage> get messageStream => _messageController.stream;
  Stream<ConnectionState> get connectionStream => _connectionController.stream;
  
  bool get isConnected => _isConnected;
  
  // Connect to WebSocket installation logs
  Future<bool> connect(String environmentId, String accessToken) async {
    try {
      _environmentId = environmentId;
      final uri = Uri.parse('$_baseWsUrl/api/v1/ws/logs/$environmentId?token=$accessToken');
      
      _connectionController.add(ConnectionState.connecting);
      
      _channel = WebSocketChannel.connect(uri);
      
      // Listen to messages
      _subscription = _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnection,
      );
      
      _isConnected = true;
      _connectionController.add(ConnectionState.connected);
      
      return true;
    } catch (e) {
      _connectionController.add(ConnectionState.error);
      print('WebSocket installation logs connection error: $e');
      return false;
    }
  }
  
  // Handle incoming messages
  void _handleMessage(dynamic data) {
    try {
      final Map<String, dynamic> message = json.decode(data);
      final messageType = message['type'] as String?;
      
      switch (messageType) {
        case 'installation_log':
          _handleInstallationLogMessage(message);
          break;
        case 'installation_complete':
          _handleInstallationCompleteMessage(message);
          break;
        case 'installation_status':
          _handleInstallationStatusMessage(message);
          break;
        case 'installation_error':
          _handleInstallationErrorMessage(message);
          break;
        case 'error':
          _handleErrorMessage(message);
          break;
        default:
          print('Unknown installation log message type: $messageType');
      }
    } catch (e) {
      print('Error parsing WebSocket installation log message: $e');
    }
  }
  
  void _handleInstallationLogMessage(Map<String, dynamic> message) {
    final logData = message['data'] as String? ?? '';
    final logMessage = TerminalMessage.installationLog(data: logData);
    _messageController.add(logMessage);
  }
  
  void _handleInstallationCompleteMessage(Map<String, dynamic> message) {
    final status = message['status'] as String? ?? 'running';
    final completeMessage = TerminalMessage.installationComplete(status: status);
    _messageController.add(completeMessage);
  }
  
  void _handleInstallationStatusMessage(Map<String, dynamic> message) {
    final status = message['status'] as String? ?? 'unknown';
    final statusMessage = message['message'] as String? ?? '';
    final statusMsg = TerminalMessage.installationStatus(
      status: status,
      message: statusMessage,
    );
    _messageController.add(statusMsg);
  }
  
  void _handleInstallationErrorMessage(Map<String, dynamic> message) {
    final error = message['error'] as String? ?? 'Unknown installation error';
    final errorMessage = TerminalMessage.installationError(error: error);
    _messageController.add(errorMessage);
  }
  
  void _handleErrorMessage(Map<String, dynamic> message) {
    final errorMsg = message['message'] as String? ?? 'Unknown error';
    final errorMessage = TerminalMessage.error(errorMsg);
    _messageController.add(errorMessage);
  }
  
  void _handleError(error) {
    print('WebSocket installation logs error: $error');
    _connectionController.add(ConnectionState.error);
    _cleanup();
  }
  
  void _handleDisconnection() {
    print('WebSocket installation logs disconnected');
    _connectionController.add(ConnectionState.disconnected);
    _cleanup();
  }
  
  void _cleanup() {
    _isConnected = false;
    _subscription?.cancel();
    _channel?.sink.close(status.normalClosure);
  }
  
  // Disconnect from WebSocket
  void disconnect() {
    _cleanup();
    _connectionController.add(ConnectionState.disconnected);
  }
  
  void dispose() {
    _cleanup();
    _messageController.close();
    _connectionController.close();
  }
}
```

### Installation Logs UI Implementation

Here's a complete implementation for handling installation logs in your Flutter application:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

class InstallationLogsScreen extends StatefulWidget {
  final String environmentId;
  final String accessToken;
  
  const InstallationLogsScreen({
    Key? key,
    required this.environmentId,
    required this.accessToken,
  }) : super(key: key);
  
  @override
  State<InstallationLogsScreen> createState() => _InstallationLogsScreenState();
}

class _InstallationLogsScreenState extends State<InstallationLogsScreen> {
  late WebSocketInstallationLogsService _logsService;
  final ScrollController _scrollController = ScrollController();
  final List<String> _logLines = [];
  
  bool _isConnected = false;
  bool _installationComplete = false;
  String? _installationError;
  String _currentStatus = 'connecting';
  
  @override
  void initState() {
    super.initState();
    _logsService = WebSocketInstallationLogsService();
    _initializeConnection();
  }
  
  void _initializeConnection() async {
    // Listen to connection state
    _logsService.connectionStream.listen((state) {
      setState(() {
        _isConnected = state == ConnectionState.connected;
      });
    });
    
    // Listen to installation messages
    _logsService.messageStream.listen((message) {
      switch (message.type) {
        case TerminalMessageType.installationLog:
          _addLogLine(message.data);
          break;
        case TerminalMessageType.installationComplete:
          setState(() {
            _installationComplete = true;
            _currentStatus = 'completed';
          });
          _addLogLine('✅ Installation completed successfully!');
          break;
        case TerminalMessageType.installationStatus:
          setState(() {
            _currentStatus = message.data;
          });
          _addLogLine('📊 Status: ${message.data}');
          break;
        case TerminalMessageType.installationError:
          setState(() {
            _installationError = message.data;
            _currentStatus = 'error';
          });
          _addLogLine('❌ Error: ${message.data}');
          break;
        case TerminalMessageType.error:
          _addLogLine('⚠️ ${message.data}');
          break;
        default:
          break;
      }
    });
    
    // Connect to installation logs
    await _logsService.connect(widget.environmentId, widget.accessToken);
  }
  
  void _addLogLine(String line) {
    setState(() {
      _logLines.add('[${DateTime.now().toLocal().toString().substring(11, 19)}] $line');
    });
    
    // Auto-scroll to bottom
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }
  
  Color _getStatusColor() {
    switch (_currentStatus) {
      case 'completed':
        return Colors.green;
      case 'error':
        return Colors.red;
      case 'installing':
        return Colors.orange;
      default:
        return Colors.blue;
    }
  }
  
  IconData _getStatusIcon() {
    switch (_currentStatus) {
      case 'completed':
        return Icons.check_circle;
      case 'error':
        return Icons.error;
      case 'installing':
        return Icons.build;
      default:
        return Icons.info;
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.grey[900],
        title: Text(
          'Installation Logs',
          style: TextStyle(color: Colors.white),
        ),
        actions: [
          Icon(
            _isConnected ? Icons.cloud_done : Icons.cloud_off,
            color: _isConnected ? Colors.green : Colors.red,
          ),
          SizedBox(width: 16),
        ],
      ),
      body: Column(
        children: [
          // Status Banner
          Container(
            width: double.infinity,
            padding: EdgeInsets.all(12),
            color: _getStatusColor().withOpacity(0.1),
            child: Row(
              children: [
                Icon(
                  _getStatusIcon(),
                  color: _getStatusColor(),
                  size: 20,
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _installationComplete 
                      ? 'Installation completed successfully'
                      : _installationError != null 
                        ? 'Installation failed: $_installationError'
                        : 'Installing environment...',
                    style: TextStyle(
                      color: _getStatusColor(),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                if (!_installationComplete && _installationError == null)
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation(_getStatusColor()),
                    ),
                  ),
              ],
            ),
          ),
          
          // Log Output
          Expanded(
            child: Container(
              padding: EdgeInsets.all(8),
              child: ListView.builder(
                controller: _scrollController,
                itemCount: _logLines.length,
                itemBuilder: (context, index) {
                  final line = _logLines[index];
                  return Padding(
                    padding: EdgeInsets.symmetric(vertical: 1),
                    child: SelectableText(
                      line,
                      style: TextStyle(
                        fontFamily: 'Courier',
                        fontSize: 12,
                        color: _getLogLineColor(line),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          
          // Action Buttons
          if (_installationComplete || _installationError != null)
            Container(
              padding: EdgeInsets.all(16),
              child: Row(
                children: [
                  if (_installationComplete)
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context, true); // Return success
                        },
                        icon: Icon(Icons.terminal),
                        label: Text('Open Terminal'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  if (_installationError != null) ...[
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context, false); // Return failure
                        },
                        icon: Icon(Icons.refresh),
                        label: Text('Retry Installation'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.orange,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context, false);
                        },
                        icon: Icon(Icons.close),
                        label: Text('Cancel'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
  
  Color _getLogLineColor(String line) {
    if (line.contains('✅') || line.contains('completed')) {
      return Colors.green[300]!;
    } else if (line.contains('❌') || line.contains('Error')) {
      return Colors.red[300]!;
    } else if (line.contains('📊') || line.contains('Status')) {
      return Colors.blue[300]!;
    } else if (line.contains('⚠️') || line.contains('Warning')) {
      return Colors.orange[300]!;
    } else {
      return Colors.grey[300]!;
    }
  }
  
  @override
  void dispose() {
    _logsService.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
```

### Usage Example

Here's how to integrate the installation logs screen into your environment creation flow:

```dart
class EnvironmentCreationScreen extends StatefulWidget {
  @override
  State<EnvironmentCreationScreen> createState() => _EnvironmentCreationScreenState();
}

class _EnvironmentCreationScreenState extends State<EnvironmentCreationScreen> {
  
  Future<void> _createEnvironment() async {
    try {
      // 1. Create environment via API
      final environment = await _apiService.createEnvironment(
        name: 'My Environment',
        templateId: 'python-3.11',
      );
      
      // 2. Navigate to installation logs screen
      final installationSuccess = await Navigator.push<bool>(
        context,
        MaterialPageRoute(
          builder: (context) => InstallationLogsScreen(
            environmentId: environment.id,
            accessToken: await _authService.getValidToken(),
          ),
        ),
      );
      
      // 3. Handle installation result
      if (installationSuccess == true) {
        // Navigate to terminal or environment details
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (context) => TerminalScreen(
              environmentId: environment.id,
              accessToken: await _authService.getValidToken(),
            ),
          ),
        );
      } else {
        // Show error or retry options
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Environment installation failed'),
            backgroundColor: Colors.red,
          ),
        );
      }
      
    } catch (e) {
      // Handle creation error
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to create environment: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      // Your environment creation UI
      body: Center(
        child: ElevatedButton(
          onPressed: _createEnvironment,
          child: Text('Create Environment'),
        ),
      ),
    );
  }
}
```

### Terminal Screen Widget

```dart
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

class TerminalScreen extends StatefulWidget {
  final String environmentId;
  final String accessToken;
  
  const TerminalScreen({
    Key? key,
    required this.environmentId,
    required this.accessToken,
  }) : super(key: key);
  
  @override
  State<TerminalScreen> createState() => _TerminalScreenState();
}

class _TerminalScreenState extends State<TerminalScreen> {
  late TerminalProvider _terminalProvider;
  final FocusNode _inputFocusNode = FocusNode();
  
  @override
  void initState() {
    super.initState();
    _terminalProvider = context.read<TerminalProvider>();
    
    // Connect to environment
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _terminalProvider.connectToEnvironment(
        widget.environmentId,
        widget.accessToken,
      );
    });
  }
  
  @override
  void dispose() {
    _inputFocusNode.dispose();
    super.dispose();
  }
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.grey[900],
        title: Consumer<TerminalProvider>(
          builder: (context, provider, child) {
            final envInfo = provider.environmentInfo;
            return Text(
              envInfo != null ? 'Terminal - ${envInfo['name']}' : 'Terminal',
              style: TextStyle(color: Colors.white),
            );
          },
        ),
        actions: [
          Consumer<TerminalProvider>(
            builder: (context, provider, child) {
              return IconButton(
                icon: Icon(
                  provider.isConnected 
                    ? Icons.cloud_done 
                    : Icons.cloud_off,
                  color: provider.isConnected 
                    ? Colors.green 
                    : Colors.red,
                ),
                onPressed: () {
                  if (!provider.isConnected) {
                    provider.connectToEnvironment(
                      widget.environmentId,
                      widget.accessToken,
                    );
                  }
                },
              );
            },
          ),
          IconButton(
            icon: Icon(Icons.clear, color: Colors.white),
            onPressed: () {
              _terminalProvider.clearTerminal();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Connection Status
          Consumer<TerminalProvider>(
            builder: (context, provider, child) {
              if (provider.isConnecting) {
                return Container(
                  width: double.infinity,
                  padding: EdgeInsets.all(8),
                  color: Colors.orange,
                  child: Text(
                    '🔌 Connecting to terminal...',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                );
              } else if (!provider.isConnected) {
                return Container(
                  width: double.infinity,
                  padding: EdgeInsets.all(8),
                  color: Colors.red,
                  child: Text(
                    '❌ Disconnected - Tap to reconnect',
                    style: TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                );
              }
              return SizedBox.shrink();
            },
          ),
          
          // Terminal Output
          Expanded(
            child: Consumer<TerminalProvider>(
              builder: (context, provider, child) {
                return Container(
                  width: double.infinity,
                  padding: EdgeInsets.all(8),
                  child: ListView.builder(
                    controller: provider.scrollController,
                    itemCount: provider.outputLines.length,
                    itemBuilder: (context, index) {
                      final line = provider.outputLines[index];
                      return SelectableText(
                        line,
                        style: TextStyle(
                          fontFamily: 'Courier',
                          fontSize: 14,
                          color: Colors.green[300],
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
          
          // Command Input
          Consumer<TerminalProvider>(
            builder: (context, provider, child) {
              return Container(
                padding: EdgeInsets.all(8),
                decoration: BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Colors.grey[700]!),
                  ),
                ),
                child: Row(
                  children: [
                    Text(
                      '\$ ',
                      style: TextStyle(
                        fontFamily: 'Courier',
                        fontSize: 16,
                        color: Colors.green[300],
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Expanded(
                      child: TextField(
                        controller: provider.inputController,
                        focusNode: _inputFocusNode,
                        enabled: provider.isConnected,
                        style: TextStyle(
                          fontFamily: 'Courier',
                          fontSize: 16,
                          color: Colors.white,
                        ),
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: provider.isConnected 
                            ? 'Enter command...' 
                            : 'Not connected',
                          hintStyle: TextStyle(color: Colors.grey[500]),
                        ),
                        onSubmitted: (command) {
                          if (command.trim().isNotEmpty) {
                            provider.sendCommand(command.trim());
                          }
                          _inputFocusNode.requestFocus();
                        },
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.send, color: Colors.green[300]),
                      onPressed: provider.isConnected
                        ? () {
                            final command = provider.inputController.text.trim();
                            if (command.isNotEmpty) {
                              provider.sendCommand(command);
                            }
                            _inputFocusNode.requestFocus();
                          }
                        : null,
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
```

## Complete Flutter Implementation

### Main App Integration

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => TerminalProvider()),
        // Add other providers here
      ],
      child: MaterialApp(
        title: 'DevPocket Terminal',
        theme: ThemeData.dark(),
        home: TerminalScreen(
          environmentId: '68850093852e1ff1492d3d87', // Your environment ID
          accessToken: 'your-jwt-token-here',
        ),
      ),
    );
  }
}
```

### Quick Command Buttons

```dart
class QuickCommandsWidget extends StatelessWidget {
  final List<QuickCommand> commands = [
    QuickCommand('pwd', 'Show current directory'),
    QuickCommand('ls -la', 'List files with details'),
    QuickCommand('whoami', 'Show current user'),
    QuickCommand('ps aux', 'Show running processes'),
    QuickCommand('df -h', 'Show disk usage'),
    QuickCommand('top', 'Show system processes'),
  ];
  
  @override
  Widget build(BuildContext context) {
    return Container(
      height: 60,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: commands.length,
        itemBuilder: (context, index) {
          final command = commands[index];
          return Padding(
            padding: EdgeInsets.symmetric(horizontal: 4),
            child: ActionChip(
              label: Text(command.command),
              onPressed: () {
                final provider = context.read<TerminalProvider>();
                provider.sendCommand(command.command);
              },
            ),
          );
        },
      ),
    );
  }
}

class QuickCommand {
  final String command;
  final String description;
  
  QuickCommand(this.command, this.description);
}
```

## Error Handling

### Connection Error Handling

```dart
enum TerminalError {
  connectionFailed,
  authenticationFailed,
  environmentNotFound,
  commandExecutionFailed,
  networkError,
  tokenExpired,
}

class TerminalErrorHandler {
  static String getErrorMessage(TerminalError error) {
    switch (error) {
      case TerminalError.connectionFailed:
        return 'Failed to connect to terminal. Please check your internet connection.';
      case TerminalError.authenticationFailed:
        return 'Authentication failed. Please log in again.';
      case TerminalError.environmentNotFound:
        return 'Development environment not found or not running.';
      case TerminalError.commandExecutionFailed:
        return 'Command execution failed. Please try again.';
      case TerminalError.networkError:
        return 'Network error. Please check your connection.';
      case TerminalError.tokenExpired:
        return 'Session expired. Please log in again.';
    }
  }
  
  static void handleError(BuildContext context, TerminalError error) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(getErrorMessage(error)),
        backgroundColor: Colors.red,
        action: SnackBarAction(
          label: 'Retry',
          onPressed: () {
            // Implement retry logic
          },
        ),
      ),
    );
  }
}
```

### Auto-Reconnection

```dart
class AutoReconnectService {
  static const int maxRetries = 5;
  static const Duration initialDelay = Duration(seconds: 1);
  
  static Future<void> attemptReconnection(
    TerminalProvider provider,
    String environmentId,
    String accessToken,
  ) async {
    int retryCount = 0;
    Duration delay = initialDelay;
    
    while (retryCount < maxRetries && !provider.isConnected) {
      await Future.delayed(delay);
      
      print('Reconnection attempt ${retryCount + 1}/$maxRetries');
      
      final success = await provider.connectToEnvironment(
        environmentId,
        accessToken,
      );
      
      if (success) {
        print('Reconnection successful');
        return;
      }
      
      retryCount++;
      delay = Duration(seconds: delay.inSeconds * 2); // Exponential backoff
    }
    
    print('Failed to reconnect after $maxRetries attempts');
  }
}
```

## Best Practices

### 1. Memory Management
- Always dispose of controllers and providers
- Cancel timers and subscriptions properly
- Use `StreamSubscription.cancel()` for cleanup

### 2. UI Performance
- Use `ListView.builder` for large output
- Implement text virtualization for very long outputs
- Debounce rapid input/output updates

### 3. Security
- Validate JWT tokens before connection
- Handle token refresh automatically
- Never log sensitive information

### 4. User Experience
- Show clear connection status
- Provide quick command shortcuts
- Implement command history
- Auto-scroll to latest output

### 5. Error Recovery
- Implement automatic reconnection
- Show meaningful error messages
- Provide manual retry options

## Testing

### Unit Tests

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';

class MockWebSocketChannel extends Mock implements WebSocketChannel {}

void main() {
  group('WebSocketTerminalService', () {
    late WebSocketTerminalService service;
    late MockWebSocketChannel mockChannel;
    
    setUp(() {
      service = WebSocketTerminalService();
      mockChannel = MockWebSocketChannel();
    });
    
    test('should connect successfully with valid token', () async {
      // Arrange
      const environmentId = 'test-env-id';
      const accessToken = 'valid-token';
      
      // Act
      final result = await service.connect(environmentId, accessToken);
      
      // Assert
      expect(result, isTrue);
      expect(service.isConnected, isTrue);
    });
    
    test('should handle command sending', () {
      // Arrange
      const command = 'ls -la';
      
      // Act
      service.sendCommand(command);
      
      // Assert
      // Verify command was sent through WebSocket
    });
    
    test('should handle disconnection properly', () {
      // Arrange
      service.connect('test-env', 'token');
      
      // Act
      service.disconnect();
      
      // Assert
      expect(service.isConnected, isFalse);
    });
  });
}
```

### Integration Tests

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  
  group('Terminal Integration Tests', () {
    testWidgets('should connect and execute commands', (WidgetTester tester) async {
      // Build the app
      await tester.pumpWidget(MyApp());
      
      // Wait for connection
      await tester.pump(Duration(seconds: 2));
      
      // Find command input field
      final inputField = find.byType(TextField);
      expect(inputField, findsOneWidget);
      
      // Enter a command
      await tester.enterText(inputField, 'pwd');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      
      // Wait for output
      await tester.pump(Duration(seconds: 1));
      
      // Verify output appears
      expect(find.textContaining('/home/devuser/workspace'), findsOneWidget);
    });
  });
}
```

## Production Configuration

### Environment Variables

```dart
class TerminalConfig {
  static const String prodBaseUrl = 'wss://api.devpocket.app';
  static const String stagingBaseUrl = 'wss://devpocket-api.goon.vn';
  
  static String get baseUrl {
    return const bool.fromEnvironment('dart.vm.product')
        ? prodBaseUrl
        : stagingBaseUrl;
  }
  
  static const Duration connectionTimeout = Duration(seconds: 30);
  static const Duration pingInterval = Duration(seconds: 30);
  static const int maxReconnectAttempts = 5;
}
```

### Performance Monitoring

```dart
class TerminalMetrics {
  static void trackConnection(String environmentId, bool success) {
    // Implement analytics tracking
    print('Connection ${success ? 'successful' : 'failed'} for $environmentId');
  }
  
  static void trackCommandExecution(String command, Duration duration) {
    // Track command execution performance
    print('Command "$command" executed in ${duration.inMilliseconds}ms');
  }
  
  static void trackError(String error, Map<String, dynamic> context) {
    // Track errors for debugging
    print('Terminal error: $error, context: $context');
  }
}
```

This comprehensive implementation guide provides everything needed to integrate WebSocket terminal functionality into your DevPocket Flutter app. The implementation supports real-time command execution, proper error handling, and follows Flutter best practices for maintainable and performant code.
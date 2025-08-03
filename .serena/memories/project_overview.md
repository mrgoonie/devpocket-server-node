# DevPocket Server - Project Overview

## Purpose
DevPocket Server is a production-ready Node.js ExpressJS backend for a mobile-first cloud IDE. It provides secure, scalable development environments accessible from mobile devices through Kubernetes orchestration.

## Key Features
- **JWT Authentication** with Google OAuth integration
- **Kubernetes Environment Management** - Creates isolated development environments as pods
- **Real-time Terminal Access** via WebSockets with tmux session persistence
- **Subscription-based Resource Allocation** (FREE, STARTER, PRO plans)
- **Template System** - Pre-configured development environments (Python, Node.js, Go, etc.)
- **Persistent Storage** for workspaces and terminal sessions
- **Comprehensive API** with Swagger documentation

## Tech Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js with Zod validation
- **Database**: PostgreSQL with Prisma ORM
- **Container Orchestration**: Kubernetes (@kubernetes/client-node)
- **Real-time Communication**: WebSockets (ws library)
- **Authentication**: JWT + Google OAuth
- **Caching**: Redis for session management
- **Package Manager**: pnpm (required)
- **Documentation**: Swagger/OpenAPI 3.0

## Architecture
- Mobile app communicates with Express API server
- API server manages Kubernetes clusters via kubeconfig
- Each user environment runs as a Kubernetes pod with persistent volumes
- WebSocket connections provide real-time terminal access through tmux sessions
- PostgreSQL stores user data, environments, templates, and metrics
- Redis handles caching and rate limiting

## Key Services
- **KubernetesService** - Manages pod lifecycle, networking, and storage
- **WebSocketService** - Handles terminal and log streaming
- **AuthService** - JWT token management and user authentication
- **EncryptionService** - Secures sensitive data like kubeconfig files

## Current Architecture Benefits
- **tmux Integration**: Terminal sessions persist across WebSocket disconnections
- **ConfigMap-based Initialization**: Prevents pod crashes from script errors
- **Persistent Volumes**: Workspace data survives container restarts
- **Multi-client Support**: Multiple connections can attach to same session
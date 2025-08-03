# DevPocket Server Node.js Dockerfile
# Multi-stage build for production optimization

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev libc6-compat

# Set working directory
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm exec prisma generate

# Build the TypeScript application
RUN pnpm run build

# Remove dev dependencies
RUN pnpm install --prod --frozen-lockfile

# Stage 2: Production stage
FROM node:20-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S devpocket -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=devpocket:nodejs /app/dist ./dist
COPY --from=builder --chown=devpocket:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=devpocket:nodejs /app/package.json ./package.json
COPY --from=builder --chown=devpocket:nodejs /app/prisma ./prisma
COPY --from=builder --chown=devpocket:nodejs /app/scripts ./scripts
COPY --from=builder --chown=devpocket:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=devpocket:nodejs /app/tsconfig.prod.json ./tsconfig.prod.json

# Install dumb-init for proper signal handling and OpenSSL for Prisma
RUN apk add --no-cache dumb-init openssl openssl-dev libc6-compat

# Create logs directory
RUN mkdir -p /app/logs && chown devpocket:nodejs /app/logs

# Switch to non-root user
USER devpocket

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node ./dist/scripts/healthcheck.js

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "scripts/start-prod.js"]

# Labels for metadata
LABEL name="devpocket-server"
LABEL version="1.0.0"
LABEL description="DevPocket Server - Mobile-first cloud IDE backend"
LABEL maintainer="DevPocket Team"
# ====================================
# AssetBridge Docker Image
# ====================================
# Multi-stage build for optimized production image
# Supports Playwright, Next.js, tRPC, MCP server, and Discord bot

FROM node:20-alpine AS base

# Install pnpm and PM2
RUN npm install -g pnpm@9.0.0 pm2

# ====================================
# Stage 1: Dependencies
# ====================================
FROM base AS dependencies
WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all packages and apps for dependency resolution
COPY packages/ packages/
COPY apps/ apps/

# Install dependencies (frozen lockfile for reproducibility)
RUN pnpm install --frozen-lockfile

# ====================================
# Stage 2: Builder
# ====================================
FROM dependencies AS builder
WORKDIR /app

# Run Next.js build only (api/mcp/crawler/discord-bot are run directly via tsx)
RUN pnpm --filter @assetbridge/web build

# ====================================
# Stage 3: Runner (Production)
# ====================================
FROM base AS runner
WORKDIR /app

# Install Playwright dependencies for Alpine
# Required for Chromium automation in crawler
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    wqy-zenhei \
    && rm -rf /var/cache/apk/*

# Configure Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy built artifacts from builder
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps ./apps
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./

# Install production dependencies only (devDependencies を除外)
RUN pnpm install --prod --frozen-lockfile 2>/dev/null || pnpm install --prod

# Copy PM2 ecosystem configs (Docker version and original)
COPY ecosystem.config.cjs ./
COPY ecosystem.docker.config.cjs ./

# Create logs directory for PM2
RUN mkdir -p logs

# Create data directory for SQLite (will be mounted as volume)
RUN mkdir -p data

# Expose ports
# 3000: Next.js web dashboard
# 8000: Hono + tRPC API
# 8001: MCP server
EXPOSE 3000 8000 8001

# Health check for API service
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start all services with PM2 in production mode (using Docker-optimized config)
CMD ["pm2-runtime", "ecosystem.docker.config.cjs"]

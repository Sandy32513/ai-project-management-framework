# Stage 1: Build dependencies and compile (if needed)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies including dev (for building/testing)
RUN npm ci

# Copy source code
COPY . .

# Run tests to verify build
RUN npm test -- --coverage

# Stage 2: Production runtime (non-root user)
FROM node:20-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built application code from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/src ./src
COPY --from=builder --chown=nodejs:nodejs /app/config ./config
COPY --from=builder --chown=nodejs:nodejs /app/roles ./roles
COPY --from=builder --chown=nodejs:nodejs /app/core ./core
COPY --from=builder --chown=nodejs:nodejs /app/README.md ./

# Switch to non-root user
USER nodejs

# Expose ports if the framework runs an API (optional; currently no HTTP server)
# EXPOSE 3000

# Health check — runs a simple init to verify config loads
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const fw=require('./src/core'); fw.init({rbac:false}); console.log('OK')" || exit 1

# Default command — start an interactive session or run a script
CMD ["node", "-i"]

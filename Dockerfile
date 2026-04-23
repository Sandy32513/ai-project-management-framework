# TASK-031: Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev 2>/dev/null || true

# Copy source
COPY . .

# Run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD node -e "const f = require('./src/core'); f.init(); console.log(JSON.stringify(f.healthCheck()));" || exit 1

# Default command: validate framework
CMD ["node", "-e", "const f = require('./src/core'); f.init(); console.log(JSON.stringify(f.validate(), null, 2));"]

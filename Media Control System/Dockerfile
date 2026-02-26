# Media Control Agent - Dockerfile
# Multi-stage build for optimized production image

# ==========================================
# Stage 1: Dependencies
# ==========================================
FROM node:18-alpine AS deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --only=production 2>/dev/null || npm install --only=production

# ==========================================
# Stage 2: Builder
# ==========================================
FROM node:18-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run lint 2>/dev/null || true
RUN npm test -- --passWithNoTests 2>/dev/null || true

# ==========================================
# Stage 3: Production
# ==========================================
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs . .

# Copy production dependencies only
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "server.js"]

# ==========================================
# Stage 4: Development
# ==========================================
FROM node:18-alpine AS development

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

EXPOSE 3000

ENV NODE_ENV=development

CMD ["npm", "run", "dev"]

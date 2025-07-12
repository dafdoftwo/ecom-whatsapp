# Use official Node.js runtime as base image
FROM node:18-alpine AS base

# Install dependencies needed for whatsapp-web.js
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    && rm -rf /var/cache/apk/*

# Set environment variable for Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Set environment variables for build
ENV DISABLE_ESLINT=true
ENV SKIP_ENV_VALIDATION=true
ENV NODE_ENV=production

# Build application
RUN npm run build

# Production stage
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Create nextjs user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next

# Create public directory and copy if exists
RUN mkdir -p ./public
COPY --from=builder /app/public ./public/ 2>/dev/null || true

# Copy other necessary files
COPY --chown=nextjs:nodejs next.config.js ./

# Copy config directory if it exists
COPY config ./config/ 2>/dev/null || true

# Ensure nextjs user owns everything
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Start application
CMD ["npm", "start"] 
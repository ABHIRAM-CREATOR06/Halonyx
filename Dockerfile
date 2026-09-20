# Use official Node.js 20 LTS Alpine image
FROM node:20-alpine AS base

# Set working directory
WORKDIR /app

# Install build dependencies required for native modules (e.g., sqlite3)
RUN apk add --no-cache python3 make g++ sqlite

# Copy package files first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY backend ./backend
COPY frontend ./frontend
COPY protocol ./protocol

# Create database directory if it doesn't exist
RUN mkdir -p backend/db

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port
EXPOSE 3000

# Declare persistent volume for SQLite database and state
VOLUME ["/app/backend/db"]

# Healthcheck to monitor server availability
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start application
CMD ["npm", "start"]

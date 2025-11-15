# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Provide Vite build-time environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend for production
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./
COPY backend/tsconfig.json ./
RUN npm ci

# Copy backend source
COPY backend/src ./src

# Build backend TypeScript
RUN npm run build

# Stage 3: Production runtime (single-process: Express serves API + static frontend)
FROM node:20-alpine AS production

WORKDIR /app

# Install wget only for container healthcheck (no Nginx)
RUN apk add --no-cache wget

# Copy backend built files and dependencies
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package.json ./backend/

# Copy frontend built files (will be served by Express in production)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose backend port
EXPOSE 3000

# Start backend (Express will also serve static frontend)
CMD ["node", "backend/dist/index.js"]

# Stage 4: Development runtime
FROM node:20-alpine AS development

WORKDIR /app

# Install all dependencies for development
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install && cd ../frontend && npm install

# Copy source files
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create log directories
RUN mkdir -p /var/log/app/backend /var/log/app/frontend

# Expose ports (3000 for backend, 5173 for frontend)
EXPOSE 3000 5173

# Install concurrently for running both services
RUN npm install -g concurrently

CMD ["sh", "-c", "cd /app && concurrently \"cd backend && npm run dev\" \"cd frontend && npm run dev -- --host\""]

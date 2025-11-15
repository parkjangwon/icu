#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine script and project directories (works from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
ENV=${1:-production}
ACTION=${2:-build}

print_info "ICU Application Docker Manager (from: $SCRIPT_DIR)"
print_info "Environment: $ENV"
print_info "Action: $ACTION"

# Determine compose files (always reference files inside docker/)
COMPOSE_BASE="-f $SCRIPT_DIR/docker-compose.yml"
COMPOSE_OVERRIDE=""
if [ "$ENV" = "development" ]; then
    COMPOSE_OVERRIDE="-f $SCRIPT_DIR/docker-compose.dev.yml"
fi
COMPOSE="$COMPOSE_BASE $COMPOSE_OVERRIDE"

# Resolve .env file priority: docker/.env.$ENV -> projectRoot/.env.$ENV
ENV_FILE="$SCRIPT_DIR/.env.$ENV"
if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ROOT_DIR/.env.$ENV" ]; then
        ENV_FILE="$ROOT_DIR/.env.$ENV"
        print_warn "Using fallback env file at project root: $(basename "$ENV_FILE")"
        print_warn "It is recommended to keep env files in: $SCRIPT_DIR/.env.$ENV"
    else
        print_error "Environment file not found: $SCRIPT_DIR/.env.$ENV (or $ROOT_DIR/.env.$ENV)"
        print_warn "Please copy $SCRIPT_DIR/.env.$ENV.example to $SCRIPT_DIR/.env.$ENV and configure it."
        exit 1
    fi
fi

# Load environment variables for convenience (compose also reads --env-file)
export $(grep -v '^#' "$ENV_FILE" | xargs)

# No local log directories required; containers log to stdout/stderr

case $ACTION in
    build)
        print_info "Building Docker image for $ENV environment..."
        docker compose $COMPOSE --env-file "$ENV_FILE" build
        print_info "Build completed successfully!"
        ;;

    up)
        print_info "Starting application in $ENV mode..."
        docker compose $COMPOSE --env-file "$ENV_FILE" up -d
        print_info "Application started!"
        if [ "$ENV" = "development" ]; then
            print_info "Development access points:"
            print_info "  Frontend (Vite):   http://localhost:5173"
            print_info "  API (Express):     http://localhost:3000"
            print_info "  Health check:      http://localhost:3000/healthz"
        else
            print_info "Access the application at: http://localhost:${HOST_PORT:-8080}"
        fi
        ;;

    down)
        print_info "Stopping application..."
        docker compose $COMPOSE --env-file "$ENV_FILE" down
        print_info "Application stopped!"
        ;;

    restart)
        print_info "Restarting application..."
        docker compose $COMPOSE --env-file "$ENV_FILE" restart
        print_info "Application restarted!"
        ;;

    logs)
        print_info "Showing logs..."
        docker compose $COMPOSE --env-file "$ENV_FILE" logs -f
        ;;

    clean)
        print_info "Cleaning up..."
        docker compose $COMPOSE --env-file "$ENV_FILE" down -v
        print_info "Cleanup completed!"
        ;;

    *)
        print_error "Unknown action: $ACTION"
        echo "Usage: $0 [environment] [action]"
        echo ""
        echo "Environments:"
        echo "  production    - Single-container (Express serves API + static frontend)"
        echo "  development   - Development build with hot-reload (backend 3000, frontend 5173)"
        echo ""
        echo "Actions:"
        echo "  build         - Build Docker image"
        echo "  up            - Start application"
        echo "  down          - Stop application"
        echo "  restart       - Restart application"
        echo "  logs          - Show application logs"
        echo "  clean         - Stop and remove all containers, volumes, and logs"
        echo ""
        echo "Examples (run from docker/ directory):"
        echo "  ./build.sh production build     # Build production image"
        echo "  ./build.sh production up        # Start production container"
        echo "  ./build.sh development up       # Start development container"
        exit 1
        ;;
esac

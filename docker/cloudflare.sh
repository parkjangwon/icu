#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

ACTION=${1:-help}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.cloudflare"
ENV_EXAMPLE="$SCRIPT_DIR/.env.cloudflare.example"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.cloudflare.yml"

print_info "ICU Cloudflare Tunnel Manager"

case $ACTION in
    setup)
        print_step "Setting up Cloudflare Tunnel configuration..."

        if [ ! -f "$ENV_FILE" ]; then
            print_warn "Environment file not found. Creating from example..."
            if [ -f "$ENV_EXAMPLE" ]; then
                cp $ENV_EXAMPLE $ENV_FILE
                print_info "Created $ENV_FILE"
                print_warn "Please edit $ENV_FILE and fill in your configuration!"
                echo ""
                echo "Required values:"
                echo "  - SUPABASE_URL"
                echo "  - SUPABASE_ANON_KEY"
                echo "  - SUPABASE_SERVICE_ROLE_KEY"
                echo "  - CLOUDFLARE_TUNNEL_TOKEN"
                echo "  - ICU_DOMAIN"
                exit 0
            else
                print_error ".env.cloudflare.example not found!"
                exit 1
            fi
        else
            print_info "Environment file already exists: $ENV_FILE"
        fi

        # 로그 디렉토리 생성 (프로젝트 루트에)
        mkdir -p "$SCRIPT_DIR/../logs/backend"
        print_info "Created log directory"

        # 환경 변수 검증
        source $ENV_FILE
        if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ] || [ "$CLOUDFLARE_TUNNEL_TOKEN" == "your-cloudflare-tunnel-token-here" ]; then
            print_error "CLOUDFLARE_TUNNEL_TOKEN is not set!"
            print_warn "Please edit $ENV_FILE and add your Cloudflare Tunnel token"
            exit 1
        fi

        if [ -z "$SUPABASE_URL" ] || [ "$SUPABASE_URL" == "https://your-project.supabase.co" ]; then
            print_error "SUPABASE_URL is not configured!"
            print_warn "Please edit $ENV_FILE and add your Supabase configuration"
            exit 1
        fi

        print_info "Configuration validated successfully!"
        print_info "Run './docker/cloudflare.sh start' to start services"
        ;;

    build)
        print_step "Building ICU application image..."
        if [ ! -f "$ENV_FILE" ]; then
            print_error "Environment file not found: $ENV_FILE"
            print_warn "Run './docker/cloudflare.sh setup' first"
            exit 1
        fi

        docker compose -f $COMPOSE_FILE --env-file $ENV_FILE build
        print_info "Build completed!"
        ;;

    start)
        print_step "Starting ICU application with Cloudflare Tunnel..."
        if [ ! -f "$ENV_FILE" ]; then
            print_error "Environment file not found: $ENV_FILE"
            print_warn "Run './docker/cloudflare.sh setup' first"
            exit 1
        fi

        docker compose -f docker-compose.cloudflare.yml --env-file $ENV_FILE up -d

        echo ""
        print_info "Services started successfully!"
        print_info "Checking service status..."
        sleep 3
        docker compose -f docker-compose.cloudflare.yml ps

        echo ""
        source $ENV_FILE
        if [ ! -z "$ICU_DOMAIN" ]; then
            print_info "Access your application at: https://${ICU_DOMAIN}"
        else
            print_warn "ICU_DOMAIN not set in $ENV_FILE"
        fi
        ;;

    stop)
        print_step "Stopping services..."
        docker compose -f docker-compose.cloudflare.yml --env-file $ENV_FILE down
        print_info "Services stopped!"
        ;;

    restart)
        print_step "Restarting services..."
        docker compose -f docker-compose.cloudflare.yml --env-file $ENV_FILE restart
        print_info "Services restarted!"
        ;;

    logs)
        print_step "Showing logs..."
        docker compose -f docker-compose.cloudflare.yml --env-file $ENV_FILE logs -f
        ;;

    status)
        print_step "Service status:"
        docker compose -f docker-compose.cloudflare.yml --env-file $ENV_FILE ps

        echo ""
        print_step "Cloudflared tunnel status:"
        docker logs icu-cloudflared --tail 20
        ;;

    clean)
        print_warn "This will stop and remove all containers, networks, and logs"
        read -p "Are you sure? (yes/no): " -r
        echo
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            print_step "Cleaning up..."
            docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down -v
            rm -rf "$SCRIPT_DIR/../logs/backend/*"
            print_info "Cleanup completed!"
        else
            print_info "Cancelled"
        fi
        ;;

    help|*)
        echo "ICU Cloudflare Tunnel Manager"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  setup     - Initialize configuration (create .env.cloudflare)"
        echo "  build     - Build Docker image"
        echo "  start     - Start application with Cloudflare Tunnel"
        echo "  stop      - Stop services"
        echo "  restart   - Restart services"
        echo "  logs      - Show and follow logs"
        echo "  status    - Show service status"
        echo "  clean     - Stop and remove all containers and logs"
        echo "  help      - Show this help message"
        echo ""
        echo "Quick Start:"
        echo "  1. $0 setup                    # Create and configure docker/.env.cloudflare"
        echo "  2. Edit docker/.env.cloudflare # Fill in your Cloudflare token and Supabase keys"
        echo "  3. $0 build                    # Build application image"
        echo "  4. $0 start                    # Start services"
        echo ""
        ;;
esac

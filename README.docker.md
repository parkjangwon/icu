# ICU Docker Guide

[한국어 버전 (Korean Version)](README.docker.ko.md)

This document explains how to develop and deploy this project with Docker. English is the default. A Korean version of the general project README is available in `README.ko.md`.

## Overview

- Single container: frontend (Vue + Vite) and backend (Express) together
- Production: Express serves both API and static frontend (container 3000 → host `${HOST_PORT:-8080}`)
- Development: backend 3000 and frontend 5173 with hot reload
- Logs: standard container stdout/stderr (no host log volume)
- Environment split: `docker/.env.production`, `docker/.env.development`
- Helper script: `docker/build.sh` to manage build/up/down/logs/clean
- No Nginx in the container. Use Cloudflare or any external reverse proxy if needed.

## Layout

- `docker/`
  - `Dockerfile` (multi-stage: build FE → build BE → production/development runtime)
  - `docker-compose.yml` (base: production defaults, container port 3000, build context is project root)
  - `docker-compose.dev.yml` (dev overrides: expose 3000/5173, bind source)
  - `build.sh` (lives inside docker/)
  - `.env.production.example`, `.env.development.example`

Note: `.dockerignore` must stay at the repository root because the Compose build context is the project root. Docker only honors `.dockerignore` at the context root.

## Prerequisites

- Docker 20.10+
- Docker Compose v2 (i.e., `docker compose`, typically Docker Desktop or recent Docker Engine)
- For remote servers, open the host port you set via `HOST_PORT` (default 8080)

## 1) Prepare environment files (inside docker/)

Copy example files and edit values.

```
cd docker
cp .env.production.example .env.production
cp .env.development.example .env.development
```

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `HOST_PORT` (default 8080)
- `IMAGE_TAG`, `BUILD_TARGET`, `HEALTH_CHECK_*`

## 2) Quick start — Development

Hot reload for both backend (3000) and frontend (5173).

```
cd docker
# Build image for development target (first time)
./build.sh development build

# Start containers
./build.sh development up

# Tail logs
./build.sh development logs
```

Access:
- Frontend: http://localhost:5173
- API: http://localhost:3000

Source changes are reflected via read-only bind mounts.

Stop/clean:
```
cd docker
./build.sh development down
./build.sh development clean  # also removes volumes
```

Run Compose directly (optional):
```
cd docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 3) Quick start — Production (local or server)

Express serves API and static frontend. Host defaults to port 8080 (host 8080 → container 3000).

```
cd docker
# Build
./build.sh production build

# Run
./build.sh production up

# Logs
./build.sh production logs
```

Access: http://localhost:${HOST_PORT:-8080}

Stop/clean:
```
cd docker
./build.sh production down
./build.sh production clean
```

Run Compose directly (optional):
```
cd docker
docker compose -f docker-compose.yml --env-file .env.production up -d --build
```

## 4) Remote deployment (A→Z)

Assumptions: Docker/Compose installed on the server; firewall allows the chosen `HOST_PORT` (default 8080).

1. Get the project onto the server
   - Option A) Clone from Git
     ```
     git clone https://github.com/parkjangwon/icu.git && cd icu
     ```
   - Option B) Upload a tarball
     ```
     tar czf icu.tar.gz icu && scp icu.tar.gz <user>@<server>:/srv/
     ssh <user>@<server>
     cd /srv && tar xzf icu.tar.gz && cd icu
     ```
2. Prepare env
   ```
   cd docker
   cp .env.production.example .env.production
   vi .env.production  # set Supabase keys/URL, HOST_PORT, etc.
   ```
3. Build and run
   ```
   ./build.sh production build
   ./build.sh production up
   ```
4. Verify
   - Browser: http://<host-or-domain>:<HOST_PORT>
   - Logs:
     ```
     ./build.sh production logs
     ```
5. Auto restart
   - `docker/docker-compose.yml` uses `restart: unless-stopped` so the container comes back after reboots.

Roll out updates:
```
git pull
cd docker
./build.sh production build
./build.sh production up
```

## 5) Cloudflare integration (optional)

Terminate TLS at Cloudflare and keep the origin app on plain HTTP. Your server only needs to expose `HOST_PORT` (default 8080).

1. Add an A record in Cloudflare DNS (orange cloud = proxied)
2. SSL/TLS mode
   - Simple: Flexible (origin is HTTP: host 8080 → container 3000)
   - Stricter: Full (Strict) requires TLS at the origin (via a host-level proxy or app TLS). The container itself does not include Nginx.
3. Start with defaults for security settings; adjust bot/firewall rules as needed.

Change origin port via `HOST_PORT` in `docker/.env.production`. Cloudflare listens on 80/443 and proxies to your origin port.

## 6) Command cheat sheet

Wrapper script:
```
cd docker
./build.sh <environment> <action>

environment: production | development
action:
  build    # build image
  up       # start (-d)
  down     # stop
  restart  # restart
  logs     # follow logs
  clean    # remove containers and volumes
```

Examples:
```
cd docker
./build.sh production build
./build.sh production up
./build.sh development up
```

Run Docker Compose directly (optional):
```
cd docker
# Production
docker compose -f docker-compose.yml --env-file .env.production up -d --build

# Development
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 7) Troubleshooting

- Hitting http://localhost:8080 during development shows "Cannot GET /"
  - Development exposes only 5173 (FE) and 3000 (API). 8080 is for production.
- Port already in use
  - Error: "Bind for 0.0.0.0:8080 failed: port is already allocated"
  - Change `HOST_PORT` in your `.env.*` or stop the conflicting process/container.
- Missing environment variables
  - Supabase URL/keys are required by the backend. Double-check `.env.*`.
- Build cache issues
  - Try `docker builder prune` or rebuild with `--no-cache`.
- File permission issues with bind mounts (development)
  - Ensure your host user can read the project files.
- Healthcheck flapping on startup
  - The app may need a few seconds to initialize; the healthcheck will pass shortly.

## Notes

- All Docker assets live under `docker/`. You can run the helper script from anywhere: `./docker/build.sh ...`.
- `.dockerignore` stays at the repository root to correctly scope the build context.
- Convenience npm scripts are available as wrappers if you prefer running from the project root:
  - `npm run docker:dev:up`, `npm run docker:dev:down`, `npm run docker:prod:up`, etc. These call `docker/build.sh` under the hood.
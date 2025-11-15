# ICU Docker 배포 가이드

본 문서는 개발자 PC 및 원격 서버에서 이 프로젝트를 Docker로 실행/배포하는 전 과정을 상세히 안내합니다.

## 구성 개요

- 단일 컨테이너에 프론트엔드(Vue, Vite) + 백엔드(Express) 통합
- 프로덕션: Express 단일 프로세스가 정적 파일과 API를 함께 서빙 (컨테이너 3000 → 호스트 `${HOST_PORT:-8080}`)
- 개발: 백엔드 3000, 프론트엔드 5173 핫리로드
- 컨테이너 로그: stdout/stderr (호스트 로그 볼륨 사용 안 함)
- 환경 분리: `docker/.env.production`, `docker/.env.development`
- 편의 스크립트: `docker/build.sh`로 build/up/down/logs/clean 일괄 관리
- Cloudflare 앞단 구성 가능: 단일 포트로 전체 앱 제공 (원본은 컨테이너 포트 3000)

## 디렉토리 구조

- `docker/`
  - `Dockerfile` (멀티 스테이지: FE 빌드 → BE 빌드 → 프로덕션/개발 런타임)
  - `docker-compose.yml` (공통: 프로덕션 기본값, 컨테이너 포트 3000, 빌드 컨텍스트는 프로젝트 루트)
  - `docker-compose.dev.yml` (개발용 오버라이드: 3000/5173 포트 노출, 소스 바인드)
  - `build.sh` (docker/ 내부에 위치하는 실행 스크립트)
  - `.env.production.example`, `.env.development.example` (예시 값)

주의: `.dockerignore`는 Docker “빌드 컨텍스트 루트(프로젝트 루트)”에 있어야 동작하므로 예외적으로 루트에 유지됩니다.

## 사전 요구사항

- Docker 20.10+
- Docker Compose 1.29+ (또는 호환 버전)
- (원격 배포 시) 서버 포트 방화벽/보안그룹 오픈 (기본 8080)

## 1) 환경 변수 준비 (docker/ 내부에서 관리)

프로덕션/개발 각각 예시 파일을 복사해 사용합니다.

```
cd docker
cp .env.production.example .env.production
cp .env.development.example .env.development
```

필수 항목
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

선택 항목
- `HOST_PORT` (기본 8080)
- `IMAGE_TAG`, `BUILD_TARGET`, `HEALTH_CHECK_*`

## 2) 빠른 시작 — 개발 모드

개발에 최적화된 핫리로드(백엔드 3000, 프론트엔드 5173)를 사용합니다.

```
cd docker
# 최초 1회 빌드 (development 타깃)
./build.sh development build

# 컨테이너 실행
./build.sh development up

# 로그 보기
./build.sh development logs
```

- 접근:
  - 프론트엔드: http://localhost:5173
  - 백엔드 API: http://localhost:3000
- 소스 변경사항은 컨테이너 내부로 바로 반영됩니다(`:ro`로 마운트되어 있어 안전하게 읽기 전용).

중지/정리:
```
cd docker
./build.sh development down
./build.sh development clean   # 볼륨/로그 포함 정리
```

직접 docker-compose로 실행하려면:
```
cd docker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 3) 빠른 시작 — 프로덕션 모드 (로컬 또는 서버)

Express가 정적 파일과 API를 모두 서빙합니다. 호스트에서는 기본 8080 포트로 접근(호스트 8080 → 컨테이너 3000 매핑)합니다.

```
cd docker
# 빌드
./build.sh production build

# 실행
./build.sh production up

# 로그 팔로우
./build.sh production logs
```

- 접근: http://localhost:${HOST_PORT:-8080}
- 로그: `docker logs icu-app` 등 표준 Docker 로그를 사용합니다.

중지/정리:
```
cd docker
./build.sh production down
./build.sh production clean
```

직접 docker-compose로 실행하려면:
```
cd docker
docker-compose -f docker-compose.yml --env-file .env.production up -d --build
```

## 4) 원격 서버에 배포하기 (A→Z)

전제: 서버에 Docker/Compose 설치, 8080 포트 오픈.

1. 프로젝트 배포
   - 옵션 A) Git으로 서버에 클론
     ```
     git clone https://github.com/parkjangwon/icu.git && cd icu
     ```
   - 옵션 B) 로컬에서 압축 업로드
     ```
     tar czf icu.tar.gz icu && scp icu.tar.gz <user>@<server>:/srv/
     ssh <user>@<server>
     cd /srv && tar xzf icu.tar.gz && cd icu
     ```
2. 환경 파일 준비
   ```
   cd docker
   cp .env.production.example .env.production
   vi .env.production  # Supabase 키/URL, HOST_PORT 등 설정
   ```
3. 빌드 및 실행
   ```
   ./build.sh production build
   ./build.sh production up
   ```
4. 서비스 확인
   - 브라우저: http://<서버IP 또는 도메인>:<HOST_PORT>
   - 서버에서 로그 확인:
     ```
     ./build.sh production logs
     ```
5. 자동 재시작
  - `docker/docker-compose.yml`은 `restart: unless-stopped` 설정을 사용합니다. 서버 재부팅 후 자동 기동됩니다.

업데이트 배포:
```
git pull
cd docker
./build.sh production build
./build.sh production up
```

## 5) Cloudflare 연동 가이드 (옵션)

도메인을 Cloudflare에 연결하여 HTTPS를 제공하고, 원격 서버는 8080 HTTP만 노출해도 됩니다.

1. Cloudflare DNS에서 도메인 A 레코드 추가 (프록시 On, 주황 구름)
2. SSL/TLS 모드 선택
   - 간편: Flexible (원본 서버는 HTTP, 기본 HOST_PORT=8080 → 컨테이너 3000)
   - 보안 강화: Full(Strict) 사용 시, 원본 서버(호스트 레벨 프록시 또는 직접 앱)에 TLS 구성 필요. 컨테이너 내부 Nginx는 사용하지 않습니다.
3. 네트워크/보안 설정은 기본값으로 시작하고, 트래픽/봇/방화벽 정책은 필요 시 조정

원본 포트 변경: `docker/.env.production`의 `HOST_PORT`로 포트를 조정하세요. Cloudflare는 80/443에서 받아 원본(예: 8080)으로 프록시합니다.

## 6) 명령어 치트시트

빌드/실행/중지/로그
```
cd docker
./build.sh <environment> <action>

environment: production | development
action:
  build   # 이미지 빌드
  up      # 컨테이너 시작 (-d)
  down    # 컨테이너 중지
  restart # 재시작
  logs    # 로그 팔로우
  clean   # 중지 + 볼륨 삭제
```

예시:
```
cd docker
./build.sh production build
./build.sh production up
./build.sh development up
```

docker-compose 직접 사용:
```
# 프로덕션
cd docker
docker-compose -f docker-compose.yml --env-file .env.production up -d --build

# 개발
cd docker
docker-compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 7) 트러블슈팅

- 포트 충돌(이미 사용 중)
  - 오류: "Bind for 0.0.0.0:8080 failed: port is already allocated"
  - 해결: `.env.*`의 `HOST_PORT`를 변경하거나 기존 프로세스/컨테이너를 중지
- 환경 변수 누락
  - Supabase 키/URL 미설정 시 백엔드에서 401/500 발생 가능. `.env.*` 재확인
- 빌드 캐시 문제
  - `docker builder prune` 또는 `--no-cache`로 재빌드 시도
- 권한 문제(호스트 파일/디렉토리)
  - 개발 모드 바인드 마운트 시 호스트 권한 문제를 확인하세요.
- 헬스체크 실패
  - 백엔드가 초기화되기 전에 체크가 수행될 수 있음. 잠시 후 재확인
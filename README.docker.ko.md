# ICU Docker 가이드 (한국어)

[English Version (영문 버전)](README.docker.md)

이 문서는 Docker를 사용해 본 프로젝트를 개발하고 배포하는 방법을 설명합니다. 기본(영문) 가이드는 `README.docker.md`를 참고하세요. 본 문서는 동일 내용을 한국어로 정리한 버전입니다.

## 개요

- 단일 컨테이너: 프론트엔드(Vue + Vite)와 백엔드(Express)를 하나의 컨테이너에서 동작
- 프로덕션: Express가 API와 정적 프론트엔드를 함께 서빙(컨테이너 3000 → 호스트 `${HOST_PORT:-8080}`)
- 개발: 백엔드 3000, 프론트엔드 5173 핫 리로드
- 로그: 컨테이너 표준 출력/표준 에러 사용(호스트 로그 볼륨 기본 미사용)
- 환경 분리: `docker/.env.production`, `docker/.env.development`
- 헬퍼 스크립트: `docker/build.sh`로 build/up/down/logs/clean 관리
- 컨테이너 내부에 Nginx 없음. 필요하면 Cloudflare 또는 외부 리버스 프록시 사용

## 디렉토리 구성

- `docker/`
  - `Dockerfile` (멀티 스테이지: FE 빌드 → BE 빌드 → 런타임)
  - `docker-compose.yml` (기본: 프로덕션, 컨테이너 포트 3000, 빌드 컨텍스트=프로젝트 루트)
  - `docker-compose.dev.yml` (개발 오버라이드: 3000/5173 노출, 소스 바인드)
  - `build.sh` (docker/ 내부에 위치)
  - `.env.production.example`, `.env.development.example`

참고: Compose의 빌드 컨텍스트가 프로젝트 루트이므로 `.dockerignore`는 반드시 저장소 루트에 있어야 합니다. Docker는 “컨텍스트 루트”의 `.dockerignore`만 인식합니다.

## 사전 준비물

- Docker 20.10+
- Docker Compose v2(예: `docker compose ...`)
- 원격 서버에서는 방화벽에서 `HOST_PORT`(기본 8080) 열기

## 1) 환경 변수 파일 준비(docker/ 폴더 내부)

예시 파일을 복사하여 값을 설정합니다.

```
cd docker
cp .env.production.example .env.production
cp .env.development.example .env.development
```

필수:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

선택:
- `HOST_PORT` (기본 8080)
- `IMAGE_TAG`, `BUILD_TARGET`, `HEALTH_CHECK_*`

## 2) 빠른 시작 — 개발(Development)

백엔드(3000)와 프론트엔드(5173) 모두 핫 리로드로 동작합니다.

```
cd docker
# 최초 한 번: 개발용 이미지 빌드
./build.sh development build

# 컨테이너 시작
./build.sh development up

# 로그 보기
./build.sh development logs
```

접속:
- 프론트엔드: http://localhost:5173
- API: http://localhost:3000

소스 변경은 읽기 전용 바인드 마운트를 통해 반영됩니다.

중지/정리:
```
cd docker
./build.sh development down
./build.sh development clean  # 볼륨까지 삭제
```

Compose를 직접 실행(선택):
```
cd docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 3) 빠른 시작 — 프로덕션(Production)

Express가 API와 정적 프론트엔드를 함께 서빙합니다. 기본 호스트 포트는 8080(호스트 8080 → 컨테이너 3000)입니다.

```
cd docker
# 빌드
./build.sh production build

# 실행
./build.sh production up

# 로그
./build.sh production logs
```

접속: http://localhost:${HOST_PORT:-8080}

중지/정리:
```
cd docker
./build.sh production down
./build.sh production clean
```

Compose를 직접 실행(선택):
```
cd docker
docker compose -f docker-compose.yml --env-file .env.production up -d --build
```

## 4) 원격 배포 A→Z

가정: 서버에 Docker/Compose가 설치되어 있고, 방화벽에서 선택한 `HOST_PORT`(기본 8080)가 열려 있습니다.

1. 서버에 프로젝트 가져오기
   - 옵션 A) Git 클론
     ```
     git clone https://github.com/parkjangwon/icu.git && cd icu
     ```
   - 옵션 B) 압축 업로드
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
4. 검증
   - 브라우저: http://<host-or-domain>:<HOST_PORT>
   - 로그:
     ```
     ./build.sh production logs
     ```
5. 자동 재시작
   - `docker/docker-compose.yml`에는 `restart: unless-stopped`가 설정되어 있어 재부팅 후에도 컨테이너가 자동으로 기동됩니다.

업데이트 롤아웃:
```
git pull
cd docker
./build.sh production build
./build.sh production up
```

## 5) Cloudflare 연동(선택)

TLS는 Cloudflare에서 종료하고, 원본 앱은 평문 HTTP로 둡니다. 서버는 `HOST_PORT`(기본 8080)만 노출하면 됩니다.

1. Cloudflare DNS에 A 레코드 추가(주황색 구름=Proxied)
2. SSL/TLS 모드
   - 간단: Flexible (원본은 HTTP: 호스트 8080 → 컨테이너 3000)
   - 엄격: Full (Strict)는 원본 서버에서 TLS가 필요(호스트 레벨 프록시 또는 앱 TLS). 컨테이너에는 Nginx가 없습니다.
3. 보안 설정은 기본값으로 시작 후, 봇/방화벽 규칙 등을 필요에 따라 조정

원본 포트 변경은 `docker/.env.production`의 `HOST_PORT`로 합니다. Cloudflare는 80/443을 수신하고 지정한 원본 포트로 프록시합니다.

## 6) 명령어 치트시트

헬퍼 스크립트:
```
cd docker
./build.sh <environment> <action>

environment: production | development
action:
  build    # 이미지 빌드
  up       # 시작(-d)
  down     # 중지
  restart  # 재시작
  logs     # 로그 팔로우
  clean    # 컨테이너/볼륨 삭제
```

예시:
```
cd docker
./build.sh production build
./build.sh production up
./build.sh development up
```

Docker Compose 직접 실행(선택):
```
cd docker
# 프로덕션
docker compose -f docker-compose.yml --env-file .env.production up -d --build

# 개발
docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.development up -d --build
```

## 7) 트러블슈팅

- 개발 중 http://localhost:8080 접속 시 "Cannot GET /"가 표시됨
  - 개발은 5173(FE)와 3000(API)만 노출합니다. 8080은 프로덕션 전용입니다.
- 포트 이미 사용 중
  - 오류: "Bind for 0.0.0.0:8080 failed: port is already allocated"
  - `.env.*`의 `HOST_PORT`를 변경하거나 충돌하는 프로세스/컨테이너를 중지하세요.
- 환경 변수 누락
  - 백엔드는 Supabase URL/키를 필요로 합니다. `.env.*` 값을 다시 확인하세요.
- 빌드 캐시 이슈
  - `docker builder prune` 또는 `--no-cache` 재빌드를 시도하세요.
- 바인드 마운트 권한 문제(개발)
  - 호스트 사용자가 프로젝트 파일을 읽을 수 있는지 확인하세요.
- 시작 직후 헬스체크 실패 반복
  - 앱 초기화에 수 초가 필요할 수 있습니다. 곧 통과됩니다.

## 비고

- 모든 Docker 자산은 `docker/` 하위에 있습니다. 어디에서든 `./docker/build.sh ...`로 헬퍼 스크립트를 실행할 수 있습니다.
- `.dockerignore`는 올바른 빌드 컨텍스트 범위를 위해 저장소 루트에 유지해야 합니다.
- 프로젝트 루트에서 실행하기 위한 npm 래퍼 스크립트도 제공됩니다:
  - `npm run docker:dev:up`, `npm run docker:dev:down`, `npm run docker:prod:up` 등(내부적으로 `docker/build.sh` 호출)

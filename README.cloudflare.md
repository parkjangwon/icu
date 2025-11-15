# ICU with Cloudflare Tunnel 배포 가이드 - A to Z

> Docker가 설치된 서버에서 Cloudflare Tunnel을 통해 ICU(Express + Vue SPA)를 안전하게 배포하는 완벽 가이드

## 📋 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [사전 요구사항](#사전-요구사항)
4. [1단계: 서버 준비 및 프로젝트 설정](#1단계-서버-준비-및-프로젝트-설정)
5. [2단계: Supabase 설정(필수)](#2단계-supabase-설정필수)
6. [3단계: Cloudflare Tunnel 생성](#3단계-cloudflare-tunnel-생성)
7. [4단계: 환경 변수 설정](#4단계-환경-변수-설정)
8. [5단계: Docker 빌드 및 실행](#5단계-docker-빌드-및-실행)
9. [6단계: 동작 확인](#6단계-동작-확인)
10. [운영(데이투) 가이드](#운영데이투-가이드)
11. [문제 해결](#문제-해결)
12. [보안/최적화 팁](#보안최적화-팁)

---

## 개요

Cloudflare Tunnel은 서버의 **공인 IP/포트를 개방하지 않고도** 인터넷에 서비스를 안전하게 노출하는 방법입니다. 서버에서 `cloudflared` 에이전트(컨테이너)를 실행하면, Cloudflare 네트워크로 아웃바운드만 열리고, 사용자는 Cloudflare가 제공하는 도메인(또는 자신의 도메인)을 통해 서비스에 접근합니다.

- 본 프로젝트는 단일 컨테이너(Express)가 API와 정적 프론트엔드(SPA)를 함께 서빙합니다(컨테이너 내부 3000).
- Cloudflare Tunnel이 외부 트래픽을 받아 `icu-app:3000`으로 프록시합니다.
- 서버 인바운드 포트 오픈이 필요 없습니다(HTTPS/방화벽 부담 감소).

## 아키텍처

- Docker Compose: 동일 네트워크 상에 두 컨테이너를 기동
  - `icu-app` (Express + SPA, 포트 3000, 헬스체크 `/healthz`)
  - `cloudflared` (Cloudflare Tunnel 커넥터, 토큰 기반 실행)
- Cloudflare Dashboard에서 터널의 퍼블릭 호스트명 → 서비스 매핑을 구성
  - 예: `icu.example.com` → `http://icu-app:3000`

## 사전 요구사항

- 서버에 Docker 및 Docker Compose v2 설치
- Cloudflare 계정과 관리 중인 도메인 (대시보드 접근 권한)
- Supabase 프로젝트(URL/Anon Key/Service Role Key)
- 서버에서 아웃바운드(443) 통신 가능

---

## 1단계: 서버 준비 및 프로젝트 설정

```bash
git clone https://github.com/parkjangwon/icu.git
cd icu/docker
```

필요 시 Node를 설치하지 않아도 됩니다(컨테이너에서 빌드/런).

## 2단계: Supabase 설정(필수)

Supabase Dashboard → Authentication → URL Configuration
- Site URL: `https://<ICU_DOMAIN>` (아래에서 지정할 퍼블릭 도메인)
- Redirect URLs: `https://<ICU_DOMAIN>/auth/callback` 추가

OAuth(Google) 사용 시 Provider 설정도 완료하세요.

## 3단계: Cloudflare Tunnel 생성

Cloudflare Dashboard → Zero Trust → Networks → Tunnels

1. Create a tunnel → 이름 지정(예: `icu-tunnel`)
2. Connector 선택: `Cloudflared` → Docker/컨테이너 방식 토큰 복사
3. Tunnel 생성 후, Public Hostname 추가
   - Hostname: `ICU_DOMAIN` (예: `icu.example.com`)
   - Service: `http://icu-app:3000`
     - 주의: 서비스 문자열은 Cloudflared 컨테이너에서 해석됩니다. 도커 네트워크 내 컨테이너명 `icu-app`으로 접근 가능하므로 `http://icu-app:3000`을 사용합니다.

토큰은 `.env.cloudflare`에 `CLOUDFLARE_TUNNEL_TOKEN`으로 저장합니다.

## 4단계: 환경 변수 설정

예시 파일을 복사하고 값을 채웁니다.

```bash
cd docker
cp .env.cloudflare.example .env.cloudflare
vi .env.cloudflare
```

필수 항목:
- `SUPABASE_URL` = `https://<your-project>.supabase.co`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDFLARE_TUNNEL_TOKEN` = 대시보드에서 복사한 터널 토큰
- `ICU_DOMAIN` = `icu.example.com`(Public Hostname)

선택 항목:
- `IMAGE_TAG`(기본 latest), `TZ`(기본 Asia/Seoul)
- `HEALTH_CHECK_*` 간격/타임아웃

## 5단계: Docker 빌드 및 실행

헬퍼 스크립트를 권장합니다.

```bash
# 최초 1회: 설정 파일 생성/검증
./cloudflare.sh setup

# 애플리케이션 이미지 빌드
./cloudflare.sh build

# 애플리케이션 + cloudflared 시작
./cloudflare.sh start

# 로그 확인
./cloudflare.sh logs
```

직접 Compose를 사용할 수도 있습니다.

```bash
docker compose -f docker-compose.cloudflare.yml --env-file .env.cloudflare up -d --build
```

참고: `docker-compose.cloudflare.yml`은 프론트엔드 빌드 시 Vite의 `VITE_*` 변수가 주입되도록 `build.args`가 이미 설정되어 있습니다.

## 6단계: 동작 확인

- 상태 확인:
  ```bash
  ./cloudflare.sh status
  # 또는
  docker compose -f docker-compose.cloudflare.yml --env-file .env.cloudflare ps
  ```
- 애플리케이션 접속: `https://<ICU_DOMAIN>`
- 헬스체크: 브라우저 또는 curl로 `https://<ICU_DOMAIN>/healthz`

SPA/로그인 동작 확인:
- OAuth 리다이렉트가 `https://<ICU_DOMAIN>/auth/callback`으로 돌아오는지 확인
- 로그인 후 세션 유지 확인(브라우저 로컬 스토리지에 Supabase 세션 키가 생성됨)

---

## 운영(데이투) 가이드

업데이트 롤아웃:
```bash
git pull
cd docker
./cloudflare.sh build
./cloudflare.sh restart
```

중지/정리:
```bash
./cloudflare.sh stop
./cloudflare.sh clean   # 컨테이너/네트워크/로그 볼륨 정리
```

로그/상태:
```bash
./cloudflare.sh logs
./cloudflare.sh status
```

백업/보존:
- 기본적으로 컨테이너 표준출력/표준에러를 사용합니다. `docker-compose.cloudflare.yml`에 백엔드 로그 볼륨 마운트 예시가 포함되어 있습니다(`../logs/backend`). 필요 시 보존정책에 맞게 조정하세요.

---

## 문제 해결

1) Cloudflared 컨테이너가 바로 종료됨
- 원인: `CLOUDFLARE_TUNNEL_TOKEN` 미설정 또는 만료
- 조치: `.env.cloudflare` 값을 재확인하고 대시보드에서 새 토큰 발급 후 재시작

2) 502/Bad Gateway 또는 도메인 접속 불가
- 원인: `icu-app` 컨테이너 비정상, 헬스체크 실패, Public Hostname의 Service 매핑 오류
- 조치: `./cloudflare.sh status`, `./cloudflare.sh logs` 확인 → 대시보드 Public Hostname의 Service가 `http://icu-app:3000`인지 재확인

3) OAuth 로그인 실패 또는 로그인 후 다시 로그인 화면으로 이동
- 원인: Supabase URL/리다이렉트 URL 불일치, CSP 정책
- 조치:
  - Supabase URL 설정: Site URL = `https://<ICU_DOMAIN>`
  - Redirect URLs에 `https://<ICU_DOMAIN>/auth/callback` 포함
  - 백엔드(Express) 보안 헤더: 프로덕션에서 Helmet이 Supabase 도메인을 `connect-src`로 허용하도록 이미 구성되어 있습니다.

4) 프론트엔드 환경변수 반영 안 됨
- 원인: Vite는 빌드타임에만 `VITE_*` 변수를 인라인
- 조치: `.env.cloudflare`의 `SUPABASE_URL/ANON_KEY`가 Compose `build.args`를 통해 프런트로 전달됩니다. 값 수정 후 반드시 재빌드하세요: `./cloudflare.sh build`

5) 포트 충돌?
- Tunnel 방식은 서버 인바운드 포트를 열지 않습니다. 충돌은 드뭅니다. 로컬에서 동일 포트를 쓰는 다른 서비스와의 충돌만 주의하면 됩니다.

---

## 보안/최적화 팁

- Cloudflare Zero Trust 정책
  - 특정 경로에 Access 정책, WAF 규칙, Bot Fight Mode 등을 적용할 수 있습니다.
- TLS 모드
  - 기본적으로 Cloudflare에서 TLS를 종료합니다. 원한다면 원본 서버(컨테이너 앞단)에 TLS를 추가해 Full(Strict) 모드로 운영할 수 있습니다.
- CSP(콘텐츠 보안 정책)
  - 본 프로젝트는 프로덕션에서 Supabase 도메인을 `connect-src`로 허용하는 CSP를 설정합니다. 외부 스크립트/이미지를 추가하면 CSP에 해당 도메인을 허용해야 할 수 있습니다.
- 관측/로깅
  - Cloudflared 로그와 `icu-app` 로그를 함께 모니터링하세요. 장애 시 두 로그를 모두 확인해야 원인이 빠르게 파악됩니다.

---

## 참고 파일

- `docker/docker-compose.cloudflare.yml` — icu-app & cloudflared 컨테이너 구성
- `docker/.env.cloudflare.example` — Cloudflare/Supabase 환경변수 예시
- `docker/cloudflare.sh` — 빌드/시작/로그/정리 스크립트

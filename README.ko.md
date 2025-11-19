# ICU (I See You) - URL 헬스 모니터

[English Version (영문 버전)](README.md)

ICU는 간단하지만 강력한 URL 헬스 모니터링 서비스입니다. 

URL을 등록하면, ICU가 주기적으로 상태와 응답 시간을 확인하고 실시간 모니터링 페이지를 제공합니다.

Google SSO(Supabase Auth)를 통한 인증이 필요합니다.

## ✨ 주요 기능

- 간편 로그인(Google SSO): Supabase Auth의 Google 로그인으로 간편하게 시작할 수 있습니다.
- 주기적인 헬스 체크: 설정된 간격으로 URL의 상태(UP/DOWN)와 응답 시간을 자동으로 확인합니다.
- 실시간 대시보드: 각 URL에 대해 고유하고 공유 가능한 페이지를 제공하며, 현재 상태, 응답 시간 차트, 확인 이력을 보여줍니다.
- 모던 UI/UX: 다크 모드와 라이트 모드를 모두 지원하는 깔끔한 인터페이스를 제공합니다.
- 알림: 텔레그램 봇 API, 슬랙 인커밍 웹훅, 디스코드 웹훅 중 하나를 전역(사용자 단위)으로 선택해 사용합니다.
  - 전체 알림 마스터 토글(한 번에 모두 끄기/켜기)
  - 알림 타입 단일선택(라디오): None | Telegram | Slack | Discord
  - 제공자별 자격 정보 입력(Bot Token/Chat ID 또는 Webhook URL)
  - 저장하지 않아도 현재 선택/입력값으로 바로 전송해보는 "Send Test" 버튼
  - 채널 공통 메시지 포맷 적용
- URL 등록 검증: 최초 등록 시 실제 네트워크 접속을 1회 수행하여 도달 불가능한 URL은 등록을 거절합니다. 실패 시 영문 메시지로 응답합니다: "Unable to connect to the specified URL. Please ensure the URL is up and running."
- 헬스 체크 이력: 각 URL당 최근 10개의 헬스 체크 결과는 데이터베이스가 아닌 메모리에 저장됩니다.
- 계정별 등록 제한: 계정당 최대 5개의 URL만 등록할 수 있습니다.
- URL 목록 자동 새로고침: URL 리스트 화면이 10초마다 자동으로 새로고침됩니다.
- 헬스체크 TLS 주의: 서버-서버 헬스체크 요청은 호환성 강화를 위해 TLS 인증서 검증을 건너뜁니다(rejectUnauthorized=false). 최종 사용자 브라우저 트래픽에는 영향을 주지 않습니다.

## 🛠️ 기술 스택

- **백엔드**: Node.js, Express, TypeScript
- **프론트엔드**: Vue.js 3, Vite, TypeScript, Tailwind CSS
- **데이터베이스**: Supabase (PostgreSQL) - 사용자 및 URL 설정 정보 저장용. 헬스 체크 이력은 메모리에 저장됩니다.

## 🚀 시작하기

### 사전 준비물

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [npm](https://www.npmjs.com/)
- 데이터베이스로 사용할 [Supabase](https://supabase.com/) 계정

### 1. 데이터베이스 설정

1.  Supabase 대시보드에서 새 프로젝트를 생성합니다.
2.  **SQL Editor** 메뉴로 이동합니다.
3.  `backend/supabase/schema.sql` 파일의 전체 내용을 복사하여 실행합니다. 이를 통해 필요한 테이블(예: `monitored_urls`)과 행 수준 보안(RLS) 정책이 생성됩니다.

### 2. 백엔드 설정

1.  백엔드 디렉토리로 이동합니다.
    ```bash
    cd backend
    ```
2.  `.env.development` 파일을 생성합니다. `.env.production` 파일을 템플릿으로 복사하여 사용할 수 있으며, 로컬 개발 환경에 맞는 값으로 수정해야 합니다. Supabase 프로젝트 정보를 입력하세요. 서버(백엔드)에서는 서비스 롤 키(Service Role Key)를 사용해야 하며, 이는 스케줄러가 RLS를 우회해 서버 측에서 안전하게 동작하기 위해 필요합니다. 백엔드는 Anon Key와 Service Role Key를 모두 사용합니다.

    **`.env.development` 예시:**
    ```env
    NODE_ENV=development
    SERVER_PORT=3000
    SUPABASE_URL=https://<your-project-id>.supabase.co
    SUPABASE_ANON_KEY=<your-supabase-anon-key>
    SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
    HEALTH_CHECK_TIMEOUT_MS=5000
    HEALTH_CHECK_INTERVAL_MS=60000
    # 헬스체크 동작 관련(기본값 예시)
    HEALTHCHECK_DEBUG=0
    HEALTHCHECK_METHOD_ORDER=GET,HEAD
    HEALTHCHECK_USE_IPV4_FIRST=1
    HEALTHCHECK_ALLOWED_STATUS_CODES=200-399,401,403
    HEALTHCHECK_HEAD_FALLBACK_STATUSES=405,501
    ```

3.  의존성을 설치합니다.
    ```bash
    npm install
    ```

4.  개발 서버를 시작합니다.
    ```bash
    npm start
    ```
    백엔드 서버가 `http://localhost:3000`에서 실행됩니다.

### 3. 프론트엔드 설정

1.  새 터미널을 열고 프론트엔드 디렉토리로 이동합니다.
    ```bash
    cd frontend
    ```

2.  의존성을 설치합니다.
    ```bash
    npm install
    ```

3.  Vite 개발 서버를 시작합니다.
    ```bash
    npm run dev
    ```
    프론트엔드 앱이 `http://localhost:5173` (또는 다른 포트)에서 실행됩니다. 앱은 API 요청을 백엔드로 자동 프록시합니다.

4.  Supabase Auth(Google SSO) 설정
    - Supabase 대시보드에서 Authentication → Providers에서 Google 제공자를 활성화합니다.
    - Authentication → URL Configuration에서 로컬 리다이렉트 URL(예: `http://localhost:5173`)을 등록합니다.

## 📝 API 엔드포인트

- 모든 엔드포인트는 Supabase Auth에서 발급된 액세스 토큰을 `Authorization: Bearer <access_token>` 헤더로 전달해야 합니다.
- `GET /api/urls`: 인증 사용자 소유의 URL 목록을 반환합니다. 각 항목에 마지막 상태(`last_is_up`)와 마지막 체크 시간(`last_checked_at`)이 포함됩니다.
- `POST /api/register-url`: 모니터링할 새 URL을 등록합니다.
  - 입력: `{ url: string }`
  - URL 형식 검증 후 최초 1회 실제 연결 검사를 수행합니다. 연결 불가 시 등록이 실패합니다.
  - 계정당 한도: 최대 5개 URL.
- `DELETE /api/urls/:uniqueId`: 해당 URL과 관련된 헬스 체크 이력을 삭제합니다.
- `PATCH /api/urls/:uniqueId/active`: 활성/비활성 상태를 토글 또는 지정합니다. 활성화 시 즉시 1회 헬스 체크를 수행합니다.
- `GET /api/monitor/:uniqueId`: 특정 URL의 모니터링 데이터를 조회합니다(최근 10개의 결과만 반환).
- 알림(전역, 사용자 단위)
  - `GET /api/notification-settings` — 저장된 제공자 설정 목록(`provider`, `config`)
  - `POST /api/notification-settings/upsert` — 특정 제공자 자격 정보 저장
  - `DELETE /api/notification-settings/:provider` — 특정 제공자 자격 정보 삭제
  - `GET /api/notification-preferences` — 마스터 토글 + `active_provider` 조회
  - `POST /api/notification-preferences` — 마스터 토글 및/또는 `active_provider` 설정
  - `POST /api/notification-settings/test` — 현재 화면에서 선택한 제공자/입력값으로 테스트 메시지 전송(요청 바디로 오버라이드 가능)

Deprecated(더 이상 사용하지 않음):
- `GET /api/notification-settings/:uniqueId`
- `POST /api/update-notification-settings`

메모
- 서버 스케줄러가 주기적으로 모든 활성 URL을 검사합니다.
- 서버는 URL당 최근 10개의 헬스 체크 결과를 메모리에 저장합니다.

## 🔔 알림

- 제공자: 텔레그램(봇 API), 슬랙(Incoming Webhook), 디스코드(Incoming Webhook)
- 선택 방식: 사용자당 정확히 1개 제공자만 활성(또는 None)
- 전역 토글: 제공자와 무관하게 모든 알림 차단/허용
- 메시지
  - 장애(실패) 메시지: `🚨 [ICU] Check Your Service! ( https://your-domain.com )` — 원본(origin: 프로토콜+호스트)만 표기
  - 테스트 메시지: `🤖 [ICU] Notification Test!`
- UI: 좌측 사이드바 → Notification 메뉴에서 설정
- Slack: `https://hooks.slack.com/services/...` 로 `{ text: "..." }` JSON POST
- Discord: `https://discord.com/api/webhooks/...` 로 `{ content: "..." }` JSON POST
- Telegram: `bot_token`, `chat_id` 필요(봇이 대상 채널/채팅에 게시 권한 보유해야 함)
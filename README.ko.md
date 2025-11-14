# ICU (I See You) - URL 헬스 모니터

[English Version (영문 버전)](README.md)

ICU는 간단하지만 강력한 URL 헬스 모니터링 서비스입니다. URL을 등록하면, ICU가 주기적으로 상태와 응답 시간을 확인하고 실시간 모니터링 페이지를 제공합니다. 현재는 Google SSO(Supabase Auth)를 통한 인증이 필요합니다.

## ✨ 주요 기능

- **간편 로그인(Google SSO)**: Supabase Auth의 Google 로그인으로 간편하게 시작할 수 있습니다.
- **주기적인 헬스 체크**: 설정된 간격으로 URL의 상태(UP/DOWN)와 응답 시간을 자동으로 확인합니다.
- **실시간 대시보드**: 각 URL에 대해 고유하고 공유 가능한 페이지를 제공하며, 현재 상태, 응답 시간 차트, 확인 이력을 보여줍니다.
- **모던 UI/UX**: **다크 모드와 라이트 모드**를 모두 지원하는 깔끔한 인터페이스를 제공합니다.
- **이메일 알림**: 서비스가 다운되었을 때 알림을 받을 이메일을 설정할 수 있습니다 (실제 이메일 발송 로직은 추후 확장 기능입니다).

## 🛠️ 기술 스택

- **백엔드**: Node.js, Express, TypeScript
- **프론트엔드**: Vue.js 3, Vite, TypeScript, Tailwind CSS
- **데이터베이스**: Supabase (PostgreSQL) - 데이터 저장 및 실시간 기능에 사용됩니다.

## 🚀 시작하기

### 사전 준비물

- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [npm](https://www.npmjs.com/)
- 데이터베이스로 사용할 [Supabase](https://supabase.com/) 계정

### 1. 데이터베이스 설정

1.  Supabase 대시보드에서 새 프로젝트를 생성합니다.
2.  **SQL Editor** 메뉴로 이동합니다.
3.  `backend/supabase/schema.sql` 파일의 전체 내용을 복사하여 실행합니다. 이를 통해 필요한 테이블(`monitored_urls`, `health_checks`)과 행 수준 보안(RLS) 정책이 생성됩니다.

### 2. 백엔드 설정

1.  백엔드 디렉토리로 이동합니다.
    ```bash
    cd backend
    ```
2.  `.env.development` 파일을 생성합니다. `.env.production` 파일을 템플릿으로 복사하여 사용할 수 있으며, 로컬 개발 환경에 맞는 값으로 수정해야 합니다. Supabase 프로젝트 정보를 입력하세요. 서버(백엔드)에서는 서비스 롤 키(Service Role Key)를 사용해야 하며, 이는 스케줄러가 RLS를 우회해 서버 측에서 안전하게 동작하기 위해 필요합니다.

    **`.env.development` 예시:**
    ```env
    NODE_ENV=development
    SERVER_PORT=3000
    SUPABASE_URL=https://<your-project-id>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
    HEALTH_CHECK_TIMEOUT_MS=5000
    HEALTH_CHECK_INTERVAL_MS=60000
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

## 📁 프로젝트 구조

```
/
├── backend/
│   ├── src/            # 백엔드 소스 코드 (Express, API 로직)
│   └── supabase/
│       └── schema.sql  # Supabase 데이터베이스 스키마
└── frontend/
    ├── src/            # 프론트엔드 소스 코드 (Vue.js)
    │   ├── components/ # Vue 컴포넌트
    │   ├── views/      # 페이지 뷰 (Home, Monitor)
    │   └── assets/     # CSS 및 기타 에셋
    └── index.html
```

## 📝 API 엔드포인트

- 모든 엔드포인트는 Supabase Auth에서 발급된 액세스 토큰을 `Authorization: Bearer <access_token>` 헤더로 전달해야 합니다.
- `POST /api/register-url`: 모니터링할 새 URL을 등록합니다.
- `GET /api/monitor/:uniqueId`: 특정 URL의 모니터링 데이터를 조회합니다(인증된 사용자 소유에 한함).
- `GET /api/notification-settings/:uniqueId`: 모니터링 항목의 알림 설정을 조회합니다.
- `POST /api/update-notification-settings`: 모니터링 항목의 알림 설정(이메일 또는 웹훅)을 업데이트합니다.

# ICU (I See You) - URL Health Monitor

[한국어 버전 (Korean Version)](README.ko.md)

ICU is a simple yet powerful URL health monitoring service. 

Register a URL, and ICU will periodically check its status and response time, providing you with a real-time monitoring page. 

Authentication is required (Google SSO via Supabase Auth).

## ✨ Key Features

- Simple Sign-in (Google SSO): Sign in with Google via Supabase Auth and start monitoring.
- Periodic Health Checks: Automatically checks your URL's status (UP/DOWN) and response time.
- Real-time Dashboard: A unique, shareable page for each URL showing its current status, response time chart, and check history.
- Modern UI/UX: Clean interface with both Dark and Light mode support.
- Global Notifications: Choose exactly one provider among Telegram Bot API, Slack Incoming Webhook, and Discord Webhook. Configure globally (per user), not per URL.
  - Master toggle to disable ALL notifications at once
  - “Alert Type” single-select (radio): None | Telegram | Slack | Discord
  - Per-provider credentials form (Bot Token/Chat ID or Webhook URL)
  - "Send Test" button to verify the currently selected provider without saving
  - Unified message format
- URL registration validation: On first registration, ICU performs a real network check and rejects unreachable URLs with an English message: "Unable to connect to the specified URL. Please ensure the URL is up and running."
- URL retention policy: For each URL, only the latest 10 health check results are kept to reduce DB load.
- Per-account limit: You can register up to 5 URLs per account.
-- URL List auto-refresh: The URL list page refreshes every 10 seconds.
-- Health-check TLS note: Server-side health checks intentionally skip TLS certificate verification (rejectUnauthorized=false) by design to improve compatibility behind CDNs/WAFs. This only affects server-to-server checks.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vue.js 3, Vite, TypeScript, Tailwind CSS
- **Database**: Supabase (PostgreSQL) for data storage and real-time capabilities.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [npm](https://www.npmjs.com/)
- A [Supabase](https://supabase.com/) account for the database.

### 1. Database Setup

1.  Create a new project in your Supabase dashboard.
2.  Go to the **SQL Editor**.
3.  Copy the entire content of `backend/supabase/schema.sql` and run it to create the necessary tables (`monitored_urls`, `health_checks`) and row-level security policies.

### 2. Backend Setup

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a `.env.development` file. You can copy `.env.production` as a template, but use your local development values. Fill it with your Supabase credentials. Make sure you use a Service Role key on the backend (required for the scheduler to bypass RLS securely on the server side). Both Anon Key and Service Role Key are required by the backend.

    **`.env.development` example:**
    ```env
    NODE_ENV=development
    SERVER_PORT=3000
    SUPABASE_URL=https://<your-project-id>.supabase.co
    SUPABASE_ANON_KEY=<your-supabase-anon-key>
    SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
    HEALTH_CHECK_TIMEOUT_MS=5000
    HEALTH_CHECK_INTERVAL_MS=60000
    # Health-check behavior (defaults shown)
    HEALTHCHECK_DEBUG=0
    HEALTHCHECK_METHOD_ORDER=GET,HEAD
    HEALTHCHECK_USE_IPV4_FIRST=1
    HEALTHCHECK_ALLOWED_STATUS_CODES=200-399,401,403
    HEALTHCHECK_HEAD_FALLBACK_STATUSES=405,501
    ```

3.  Install dependencies:
    ```bash
    npm install
    ```

4.  Start the development server:
    ```bash
    npm start
    ```
    The backend will be running on `http://localhost:3000`.

### 3. Frontend Setup

1.  In a new terminal, navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the Vite development server:
    ```bash
    npm run dev
    ```
    The frontend will be accessible at `http://localhost:5173` (or another port if 5173 is busy). The app will automatically proxy API requests to the backend.

4.  Configure Supabase Auth (Google SSO):
    - In your Supabase project, enable the Google provider under Authentication → Providers.
    - Add your local redirect URLs (e.g., `http://localhost:5173`) under Authentication → URL Configuration as needed.

## 📝 API Endpoints

- All endpoints require a valid `Authorization: Bearer <access_token>` header from Supabase Auth.
- `GET /api/urls`: Returns the authenticated user's URL list including last status (`last_is_up`) and last checked time (`last_checked_at`).
- `POST /api/register-url`: Registers a new URL for monitoring.
  - Input: `{ url: string }`
  - Validates URL format and performs an initial reachability check. Registration fails if the URL is unreachable.
  - Per-account limit: max 5 URLs.
- `DELETE /api/urls/:uniqueId`: Deletes the monitored URL and its health check history.
- `PATCH /api/urls/:uniqueId/active`: Sets or toggles active status. When activating, performs an immediate health check.
- `GET /api/monitor/:uniqueId`: Retrieves monitoring data for a specific URL (only the last 10 results are returned).
- Notification (global, per user)
  - `GET /api/notification-settings` — list of saved provider settings (`provider`, `config`)
  - `POST /api/notification-settings/upsert` — save credentials for a provider
  - `DELETE /api/notification-settings/:provider` — delete credentials
  - `GET /api/notification-preferences` — get master toggle + `active_provider`
  - `POST /api/notification-preferences` — set master toggle and/or `active_provider`
  - `POST /api/notification-settings/test` — send a test message via the currently selected provider (can override with request body)

Deprecated (removed UI/usage):
- `GET /api/notification-settings/:uniqueId`
- `POST /api/update-notification-settings`

Notes
- Scheduler runs periodically on the server to check all active URLs.
- After each insert, retention cleanup keeps only the latest 10 results per URL.

## 🔔 Notifications

- Providers: Telegram (Bot API), Slack (Incoming Webhook), Discord (Incoming Webhook)
- Selection: exactly one active provider per user (or None)
- Global toggle: disable all notifications regardless of provider
- Messages
  - Outage (failure) message: `🚨 [ICU] Check Your Service! ( https://your-domain.com )` — only the origin (protocol + host) is shown
  - Test message: `🤖 [ICU] Notification Test!`
- UI: open the left sidebar → Notification to configure
- Slack: send JSON `{ text: "..." }` to `https://hooks.slack.com/services/...`
- Discord: send JSON `{ content: "..." }` to `https://discord.com/api/webhooks/...`
- Telegram: needs `bot_token` and `chat_id` (ensure the bot has permission to post to the chat/channel)
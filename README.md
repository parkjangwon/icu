# ICU (I See You) - URL Health Monitor

[한국어 버전 (Korean Version)](README.ko.md)

ICU is a simple yet powerful anonymous URL health monitoring service. Register a URL, and ICU will periodically check its status and response time, providing you with a real-time monitoring page.

## ✨ Key Features

- **Anonymous & Simple**: No sign-up required. Just enter a URL to start monitoring.
- **Periodic Health Checks**: Automatically checks your URL's status (UP/DOWN) and response time.
- **Real-time Dashboard**: A unique, shareable page for each URL showing its current status, response time chart, and check history.
- **Modern UI/UX**: Clean interface with both **Dark and Light mode** support.
- **Email Notifications**: Set up email alerts to be notified when your service goes down (backend logic for sending emails is a future extension).

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
2.  Create a `.env.development` file. You can copy `.env.production` as a template, but use your local development values. Fill it with your Supabase credentials.

    **`.env.development` example:**
    ```env
    NODE_ENV=development
    SERVER_PORT=3000
    SUPABASE_URL=https://<your-project-id>.supabase.co
    SUPABASE_ANON_KEY=<your-supabase-anon-key>
    HEALTH_CHECK_TIMEOUT_MS=5000
    HEALTH_CHECK_INTERVAL_MS=60000
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

## 📁 Project Structure

```
/
├── backend/
│   ├── src/            # Backend source code (Express, API logic)
│   └── supabase/
│       └── schema.sql  # Database schema for Supabase
└── frontend/
    ├── src/            # Frontend source code (Vue.js)
    │   ├── components/ # Vue components
    │   ├── views/      # Page views (Home, Monitor)
    │   └── assets/     # CSS and other assets
    └── index.html
```

## 📝 API Endpoints

- `POST /api/register-url`: Registers a new URL for monitoring.
- `GET /api/monitor/:uniqueId`: Retrieves monitoring data for a specific URL.
- `POST /api/update-notification-email`: Updates the notification email for a monitored URL.

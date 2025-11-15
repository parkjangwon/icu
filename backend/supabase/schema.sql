-- 3. 데이터 모델 (Supabase Schema) 정의

-- monitored_urls 테이블 생성
CREATE TABLE public.monitored_urls (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    unique_id text NOT NULL,
    target_url text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT monitored_urls_pkey PRIMARY KEY (id),
    CONSTRAINT monitored_urls_unique_id_key UNIQUE (unique_id)
);

-- unique_id에 대한 인덱스 생성
CREATE INDEX idx_monitored_urls_unique_id ON public.monitored_urls USING btree (unique_id);

-- health_checks 테이블 생성
CREATE TABLE public.health_checks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    monitored_url_id uuid NOT NULL,
    status_code integer NULL,
    response_time_ms integer NULL,
    check_time timestamp with time zone NOT NULL DEFAULT now(),
    is_success boolean NOT NULL,
    CONSTRAINT health_checks_pkey PRIMARY KEY (id),
    CONSTRAINT health_checks_monitored_url_id_fkey FOREIGN KEY (monitored_url_id) REFERENCES public.monitored_urls(id) ON DELETE CASCADE
);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.monitored_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;

-- RLS 정책 생성

-- monitored_urls: 인증된 사용자만 자신의 URL을 등록(INSERT)할 수 있도록 허용합니다.
CREATE POLICY "Allow authenticated users to insert their own urls"
ON public.monitored_urls
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- monitored_urls: 인증된 사용자만 자신의 레코드를 읽을(SELECT) 수 있습니다.
CREATE POLICY "Allow authenticated users to read their own urls"
ON public.monitored_urls
FOR SELECT
USING (auth.uid() = user_id);

-- monitored_urls: 인증된 사용자만 자신의 레코드를 업데이트할 수 있습니다.
CREATE POLICY "Allow authenticated users to update their own urls"
ON public.monitored_urls
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- monitored_urls: 인증된 사용자만 자신의 레코드를 삭제할 수 있습니다.
CREATE POLICY "Allow authenticated users to delete their own urls"
ON public.monitored_urls
FOR DELETE
USING (auth.uid() = user_id);

-- health_checks: 누구나 health_checks를 생성(INSERT)할 수 있습니다. (서버 로직에서 사용)
CREATE POLICY "Allow public insert for server"
ON public.health_checks
FOR INSERT
WITH CHECK (true);

-- health_checks: 연결된 monitored_url 레코드를 볼 수 있는 사람은 누구나 health_checks를 읽을(SELECT) 수 있습니다.
CREATE POLICY "Allow authenticated users to read health checks for their own urls"
ON public.health_checks
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.monitored_urls mu
    WHERE mu.id = monitored_url_id AND mu.user_id = auth.uid()
  )
);

-- 전역 알림 설정: 사용자 단위의 알림 프로바이더 설정 테이블
-- 각 사용자는 telegram/slack/discord 각각에 대해 설정을 보유할 수 있습니다.
-- 필요 파라미터는 provider별로 config(jsonb)에 저장합니다.
--   - telegram: { "bot_token": "...", "chat_id": "..." }
--   - slack:    { "webhook_url": "..." }  (또는 향후 bot_token/channel 지원 가능)
--   - discord:  { "webhook_url": "..." }
CREATE TABLE public.notification_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('telegram','slack','discord')),
    is_enabled boolean NOT NULL DEFAULT true,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notification_settings_pkey PRIMARY KEY (id),
    CONSTRAINT notification_settings_user_provider_uniq UNIQUE (user_id, provider)
);

-- 전역 알림 마스터 토글: 사용자 단위로 전체 알림 사용 여부를 관리
-- notifications_enabled = false 인 경우, 어떤 프로바이더 설정이 있더라도 모든 알림 전송을 차단합니다.
CREATE TABLE public.notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    notifications_enabled boolean NOT NULL DEFAULT true,
    -- 라디오 선택형 단일 프로바이더 지정 (없음 가능)
    active_provider text NULL CHECK (active_provider IN ('telegram','slack','discord')),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 트리거: updated_at 갱신
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notification_settings_touch ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_touch
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_notification_preferences_touch ON public.notification_preferences;
CREATE TRIGGER trg_notification_preferences_touch
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS 활성화
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 정책: 본인 것만 접근
CREATE POLICY "Allow authenticated users to manage their notification settings"
ON public.notification_settings
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to manage their notification preferences"
ON public.notification_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

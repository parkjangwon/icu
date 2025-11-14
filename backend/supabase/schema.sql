-- 3. 데이터 모델 (Supabase Schema) 정의

-- monitored_urls 테이블 생성
CREATE TABLE public.monitored_urls (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    unique_id text NOT NULL,
    target_url text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    notification_type text NULL,
    email text NULL,
    webhook_url text NULL,
    webhook_method text NULL,
    webhook_headers jsonb NULL,
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

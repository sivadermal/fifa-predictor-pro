
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS visible_from timestamptz;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS matches_external_id_key ON public.matches(external_id) WHERE external_id IS NOT NULL;

-- Backfill visible_from for existing matches: open 24h before kickoff
UPDATE public.matches SET visible_from = kickoff - interval '24 hours' WHERE visible_from IS NULL;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps self read" ON public.push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "ps self insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "ps self delete" ON public.push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.sync_state (
  key text primary key,
  last_run_at timestamptz,
  payload jsonb
);
GRANT ALL ON public.sync_state TO service_role;
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
-- no policies = service_role only

-- Track which matches we've already sent the "predictions open" push for
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS open_notified_at timestamptz;

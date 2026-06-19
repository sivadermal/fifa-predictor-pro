
-- USERS
CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  device_id text NOT NULL UNIQUE,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
-- no public policies; access via server functions only

-- MATCHES
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team1 text NOT NULL,
  team1_flag text,
  team2 text NOT NULL,
  team2_flag text,
  competition text NOT NULL DEFAULT 'FIFA',
  kickoff timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed','cancelled')),
  team1_score int,
  team2_score int,
  winner text CHECK (winner IN ('team1','draw','team2')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches readable by all" ON public.matches FOR SELECT TO anon, authenticated USING (true);

-- PREDICTIONS
CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  pick text NOT NULL CHECK (pick IN ('team1','draw','team2')),
  is_correct boolean,
  points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
-- no public policies

CREATE INDEX predictions_user_idx ON public.predictions(user_id);
CREATE INDEX predictions_match_idx ON public.predictions(match_id);
CREATE INDEX matches_kickoff_idx ON public.matches(kickoff);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER matches_touch BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER predictions_touch BEFORE UPDATE ON public.predictions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- LEADERBOARD view
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  u.id AS user_id,
  u.username,
  COALESCE(SUM(p.points), 0)::int AS total_points,
  COALESCE(SUM(CASE WHEN p.is_correct THEN 1 ELSE 0 END), 0)::int AS correct_predictions,
  COUNT(p.id)::int AS total_predictions,
  CASE WHEN COUNT(p.id) > 0
    THEN ROUND(100.0 * SUM(CASE WHEN p.is_correct THEN 1 ELSE 0 END) / COUNT(p.id), 1)
    ELSE 0 END AS accuracy,
  RANK() OVER (ORDER BY COALESCE(SUM(p.points), 0) DESC) AS rank
FROM public.app_users u
LEFT JOIN public.predictions p ON p.user_id = u.id
WHERE u.disabled = false
GROUP BY u.id, u.username;

GRANT SELECT ON public.leaderboard TO anon, authenticated, service_role;

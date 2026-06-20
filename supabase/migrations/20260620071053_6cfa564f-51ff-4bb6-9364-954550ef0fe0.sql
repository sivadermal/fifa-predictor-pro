-- Wipe old model
DROP VIEW IF EXISTS public.leaderboard CASCADE;
DROP TABLE IF EXISTS public.predictions CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.app_users CASCADE;

-- Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  name text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_user_id_lower_idx ON public.profiles (lower(user_id));
GRANT SELECT ON public.profiles TO authenticated, anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles public read" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

-- Matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team1 text NOT NULL,
  team1_flag text,
  team2 text NOT NULL,
  team2_flag text,
  competition text NOT NULL DEFAULT 'FIFA',
  kickoff timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','completed','cancelled')),
  team1_score integer,
  team2_score integer,
  winner text CHECK (winner IN ('team1','draw','team2')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches public read" ON public.matches FOR SELECT TO anon, authenticated USING (true);

-- Predictions
CREATE TABLE public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pick text NOT NULL CHECK (pick IN ('team1','draw','team2')),
  is_correct boolean,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);
GRANT SELECT ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions self read" ON public.predictions FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Point adjustments ledger
CREATE TABLE public.point_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.point_adjustments TO authenticated;
GRANT ALL ON public.point_adjustments TO service_role;
ALTER TABLE public.point_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adjustments self read" ON public.point_adjustments FOR SELECT TO authenticated USING (user_id = auth.uid());

-- updated_at trigger
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_matches_updated BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_predictions_updated BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Leaderboard view: prediction points + adjustments
CREATE VIEW public.leaderboard
WITH (security_invoker = true) AS
WITH pred AS (
  SELECT user_id,
         COALESCE(SUM(points),0)::int AS pred_points,
         COUNT(*)::int AS total_predictions,
         COUNT(*) FILTER (WHERE is_correct IS TRUE)::int AS correct_predictions
  FROM public.predictions GROUP BY user_id
),
adj AS (
  SELECT user_id, COALESCE(SUM(delta),0)::int AS adj_points
  FROM public.point_adjustments GROUP BY user_id
)
SELECT
  p.id AS user_id,
  p.user_id AS handle,
  p.name,
  p.disabled,
  COALESCE(pred.pred_points,0) + COALESCE(adj.adj_points,0) AS total_points,
  COALESCE(pred.total_predictions,0) AS total_predictions,
  COALESCE(pred.correct_predictions,0) AS correct_predictions,
  CASE WHEN COALESCE(pred.total_predictions,0) > 0
       THEN ROUND(100.0 * pred.correct_predictions / pred.total_predictions, 1)
       ELSE 0 END AS accuracy,
  RANK() OVER (ORDER BY (COALESCE(pred.pred_points,0) + COALESCE(adj.adj_points,0)) DESC) AS rank
FROM public.profiles p
LEFT JOIN pred ON pred.user_id = p.id
LEFT JOIN adj ON adj.user_id = p.id
WHERE p.disabled = false;

GRANT SELECT ON public.leaderboard TO anon, authenticated;

DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard
WITH (security_invoker = true) AS
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

-- Allow anon to read leaderboard which reads from app_users; add a tiny policy that exposes only safe columns via view
CREATE POLICY "app_users readable for leaderboard" ON public.app_users FOR SELECT TO anon, authenticated USING (true);

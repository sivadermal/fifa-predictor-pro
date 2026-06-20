import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export const listMatches = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("matches")
    .select("*")
    .order("kickoff", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("leaderboard")
    .select("*")
    .order("rank", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
});

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, user_id, name, disabled, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) return null;
    const { data: lb } = await supabase
      .from("leaderboard")
      .select("total_points, correct_predictions, total_predictions, accuracy, rank")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      ...profile,
      total_points: lb?.total_points ?? 0,
      correct_predictions: lb?.correct_predictions ?? 0,
      total_predictions: lb?.total_predictions ?? 0,
      accuracy: lb?.accuracy ?? 0,
      rank: lb?.rank ?? null,
    };
  });

export const getMyPredictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("predictions")
      .select("id, match_id, pick, is_correct, points, created_at")
      .eq("user_id", context.userId);
    if (error) throw error;
    return data ?? [];
  });

export const submitPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        matchId: z.string().uuid(),
        pick: z.enum(["team1", "draw", "team2"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("disabled")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("NO_PROFILE");
    if (profile.disabled) throw new Error("USER_DISABLED");

    const { data: match } = await supabaseAdmin
      .from("matches")
      .select("id, kickoff, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!match) throw new Error("MATCH_NOT_FOUND");
    if (match.status === "cancelled") throw new Error("MATCH_CANCELLED");
    if (match.status === "completed") throw new Error("MATCH_COMPLETED");

    const kickoffMs = new Date(match.kickoff).getTime();
    const now = Date.now();
    if (now >= kickoffMs) throw new Error("PREDICTION_CLOSED");
    if (kickoffMs - now > 24 * 60 * 60 * 1000) throw new Error("PREDICTION_NOT_OPEN");

    const { error } = await supabaseAdmin
      .from("predictions")
      .upsert(
        { user_id: context.userId, match_id: match.id, pick: data.pick },
        { onConflict: "match_id,user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

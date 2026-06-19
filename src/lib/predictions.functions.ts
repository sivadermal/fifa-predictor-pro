import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function getAdmin() {
  // Use service-role client; predictions/app_users have no public policies.
  return import("@/integrations/supabase/client.server").then((m) => m.supabaseAdmin);
}

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters")
  .max(24, "Username must be at most 24 characters")
  .regex(/^[a-zA-Z0-9_\- .]+$/, "Only letters, numbers, _, -, . and spaces");

const deviceSchema = z.string().min(8).max(128);

export const registerUser = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: usernameSchema, deviceId: deviceSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await getAdmin();
    // Existing device?
    const { data: existing } = await supabase
      .from("app_users")
      .select("id, username, disabled")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    if (existing) {
      return { id: existing.id, username: existing.username, disabled: existing.disabled, isNew: false };
    }
    // Username taken?
    const { data: taken } = await supabase
      .from("app_users")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (taken) {
      throw new Error("USERNAME_TAKEN");
    }
    const { data: created, error } = await supabase
      .from("app_users")
      .insert({ username: data.username, device_id: data.deviceId })
      .select("id, username, disabled")
      .single();
    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) throw new Error("USERNAME_TAKEN");
      throw error;
    }
    return { id: created.id, username: created.username, disabled: created.disabled, isNew: true };
  });

export const getMe = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ deviceId: deviceSchema }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await getAdmin();
    const { data: user } = await supabase
      .from("app_users")
      .select("id, username, disabled, created_at")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    if (!user) return null;
    const { data: lb } = await supabase
      .from("leaderboard")
      .select("total_points, correct_predictions, total_predictions, accuracy, rank")
      .eq("user_id", user.id)
      .maybeSingle();
    return {
      ...user,
      total_points: lb?.total_points ?? 0,
      correct_predictions: lb?.correct_predictions ?? 0,
      total_predictions: lb?.total_predictions ?? 0,
      accuracy: lb?.accuracy ?? 0,
      rank: lb?.rank ?? null,
    };
  });

export const listMatches = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

export const getMyPredictions = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ deviceId: deviceSchema }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await getAdmin();
    const { data: user } = await supabase
      .from("app_users")
      .select("id")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    if (!user) return [];
    const { data: preds, error } = await supabase
      .from("predictions")
      .select("id, match_id, pick, is_correct, points, created_at")
      .eq("user_id", user.id);
    if (error) throw error;
    return preds ?? [];
  });

export const submitPrediction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        deviceId: deviceSchema,
        matchId: z.string().uuid(),
        pick: z.enum(["team1", "draw", "team2"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await getAdmin();
    const { data: user } = await supabase
      .from("app_users")
      .select("id, disabled")
      .eq("device_id", data.deviceId)
      .maybeSingle();
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.disabled) throw new Error("USER_DISABLED");
    const { data: match } = await supabase
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

    const { error } = await supabase
      .from("predictions")
      .upsert(
        { user_id: user.id, match_id: match.id, pick: data.pick },
        { onConflict: "match_id,user_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("leaderboard")
    .select("*")
    .order("rank", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data ?? [];
});

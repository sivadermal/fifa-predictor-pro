import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function getAdmin() {
  return import("@/integrations/supabase/client.server").then((m) => m.supabaseAdmin);
}
function getSession() {
  return import("./admin-session.server").then((m) => m.getAdminSession());
}
async function requireAdmin() {
  const s = await getSession();
  if (!s.data?.isAdmin) throw new Error("UNAUTHORIZED");
}

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data }) => {
    const u = process.env.ADMIN_USERNAME;
    const p = process.env.ADMIN_PASSWORD;
    if (!u || !p) throw new Error("ADMIN_NOT_CONFIGURED");
    if (data.username !== u || data.password !== p) throw new Error("INVALID_CREDENTIALS");
    const s = await getSession();
    await s.update({ isAdmin: true, loggedInAt: Date.now() });
    return { ok: true };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const s = await getSession();
  await s.clear();
  return { ok: true };
});

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  const s = await getSession();
  return { isAdmin: !!s.data?.isAdmin };
});

const matchInput = z.object({
  team1: z.string().min(1).max(64),
  team1_flag: z.string().max(8).optional().nullable(),
  team2: z.string().min(1).max(64),
  team2_flag: z.string().max(8).optional().nullable(),
  competition: z.string().min(1).max(64),
  kickoff: z.string(), // ISO
  status: z.enum(["upcoming", "live", "completed", "cancelled"]).optional(),
});

export const adminCreateMatch = createServerFn({ method: "POST" })
  .inputValidator((input) => matchInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const supabase = await getAdmin();
    const { data: row, error } = await supabase.from("matches").insert(data).select("*").single();
    if (error) throw error;
    return row;
  });

export const adminUpdateMatch = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), patch: matchInput.partial() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const supabase = await getAdmin();
    const { data: row, error } = await supabase
      .from("matches")
      .update(data.patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const adminDeleteMatch = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const supabase = await getAdmin();
    const { error } = await supabase.from("matches").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetResult = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        team1_score: z.number().int().min(0).max(99),
        team2_score: z.number().int().min(0).max(99),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const supabase = await getAdmin();
    const winner: "team1" | "draw" | "team2" =
      data.team1_score > data.team2_score
        ? "team1"
        : data.team1_score < data.team2_score
          ? "team2"
          : "draw";
    const { error: e1 } = await supabase
      .from("matches")
      .update({
        team1_score: data.team1_score,
        team2_score: data.team2_score,
        winner,
        status: "completed",
      })
      .eq("id", data.id);
    if (e1) throw e1;
    // Recalculate predictions for this match
    const { data: preds, error: e2 } = await supabase
      .from("predictions")
      .select("id, pick")
      .eq("match_id", data.id);
    if (e2) throw e2;
    for (const p of preds ?? []) {
      const correct = p.pick === winner;
      await supabase
        .from("predictions")
        .update({ is_correct: correct, points: correct ? 1 : 0 })
        .eq("id", p.id);
    }
    return { ok: true, winner, scored: preds?.length ?? 0 };
  });

export const adminRecalculate = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const supabase = await getAdmin();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, winner, status")
    .eq("status", "completed");
  let total = 0;
  for (const m of matches ?? []) {
    if (!m.winner) continue;
    const { data: preds } = await supabase
      .from("predictions")
      .select("id, pick")
      .eq("match_id", m.id);
    for (const p of preds ?? []) {
      const correct = p.pick === m.winner;
      await supabase
        .from("predictions")
        .update({ is_correct: correct, points: correct ? 1 : 0 })
        .eq("id", p.id);
      total++;
    }
  }
  return { ok: true, updated: total };
});

export const adminListUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const supabase = await getAdmin();
  const { data: users, error } = await supabase
    .from("app_users")
    .select("id, username, device_id, disabled, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const { data: lb } = await supabase.from("leaderboard").select("*");
  const map = new Map((lb ?? []).map((r) => [r.user_id, r]));
  return (users ?? []).map((u) => ({
    ...u,
    total_points: map.get(u.id)?.total_points ?? 0,
    total_predictions: map.get(u.id)?.total_predictions ?? 0,
  }));
});

export const adminToggleUser = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const supabase = await getAdmin();
    const { error } = await supabase.from("app_users").update({ disabled: data.disabled }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminListPredictions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("predictions")
    .select("id, match_id, user_id, pick, is_correct, points, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data ?? [];
});

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
  kickoff: z.string(),
  status: z.enum(["upcoming", "live", "completed", "cancelled"]).optional(),
});

export const adminCreateMatch = createServerFn({ method: "POST" })
  .inputValidator((input) => matchInput.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { data: row, error } = await sb.from("matches").insert(data).select("*").single();
    if (error) throw error;
    return row;
  });

export const adminUpdateMatch = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), patch: matchInput.partial() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { data: row, error } = await sb
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
    const sb = await getAdmin();
    const { error } = await sb.from("matches").delete().eq("id", data.id);
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
    const sb = await getAdmin();
    const winner: "team1" | "draw" | "team2" =
      data.team1_score > data.team2_score
        ? "team1"
        : data.team1_score < data.team2_score
          ? "team2"
          : "draw";
    const { error: e1 } = await sb
      .from("matches")
      .update({
        team1_score: data.team1_score,
        team2_score: data.team2_score,
        winner,
        status: "completed",
      })
      .eq("id", data.id);
    if (e1) throw e1;
    const { data: preds, error: e2 } = await sb
      .from("predictions")
      .select("id, pick")
      .eq("match_id", data.id);
    if (e2) throw e2;
    for (const p of preds ?? []) {
      const correct = p.pick === winner;
      await sb
        .from("predictions")
        .update({ is_correct: correct, points: correct ? 1 : 0 })
        .eq("id", p.id);
    }
    return { ok: true, winner, scored: preds?.length ?? 0 };
  });

export const adminRecalculate = createServerFn({ method: "POST" }).handler(async () => {
  await requireAdmin();
  const sb = await getAdmin();
  const { data: matches } = await sb
    .from("matches")
    .select("id, winner, status")
    .eq("status", "completed");
  let total = 0;
  for (const m of matches ?? []) {
    if (!m.winner) continue;
    const { data: preds } = await sb.from("predictions").select("id, pick").eq("match_id", m.id);
    for (const p of preds ?? []) {
      const correct = p.pick === m.winner;
      await sb
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
  const sb = await getAdmin();
  const { data: users, error } = await sb
    .from("profiles")
    .select("id, user_id, name, disabled, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const { data: lb } = await sb.from("leaderboard").select("*");
  const map = new Map((lb ?? []).map((r) => [r.user_id, r]));
  return (users ?? []).map((u) => ({
    ...u,
    total_points: map.get(u.id)?.total_points ?? 0,
    total_predictions: map.get(u.id)?.total_predictions ?? 0,
    correct_predictions: map.get(u.id)?.correct_predictions ?? 0,
  }));
});

export const adminToggleUser = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { error } = await sb.from("profiles").update({ disabled: data.disabled }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminAdjustPoints = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        delta: z.number().int().min(-1000).max(1000),
        reason: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { error } = await sb.from("point_adjustments").insert({
      user_id: data.userId,
      delta: data.delta,
      reason: data.reason ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminListAdjustments = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { data: rows, error } = await sb
      .from("point_adjustments")
      .select("id, delta, reason, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const adminListPredictions = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const sb = await getAdmin();
  const { data: preds, error } = await sb
    .from("predictions")
    .select("id, match_id, user_id, pick, is_correct, points, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const { data: profiles } = await sb.from("profiles").select("id, user_id, name");
  const { data: matches } = await sb.from("matches").select("id, team1, team2");
  const pMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const mMap = new Map((matches ?? []).map((m) => [m.id, m]));
  return (preds ?? []).map((p) => ({
    ...p,
    profile: pMap.get(p.user_id) ?? null,
    match: mMap.get(p.match_id) ?? null,
  }));
});

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const sb = await getAdmin();
    const { error } = await sb.auth.admin.deleteUser(data.id);
    if (error) throw error;
    return { ok: true };
  });

// Football-Data.org importer + open-window notifier.
// Free tier: WC (World Cup), CL (UEFA Champions League), EC (Euros), etc.

import { sendPushToAll } from "./push.server";

const COMPETITIONS = ["WC", "CL", "EC"]; // FIFA World Cup + UEFA Champions League + Euros

type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string };
  homeTeam: { name: string; tla?: string | null };
  awayTeam: { name: string; tla?: string | null };
};

// Best-effort country/team emoji from a 3-letter code; falls back to neutral flag.
function flagFor(_tla?: string | null) {
  return "🏳️";
}

export async function runMatchImport() {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return { ok: false, error: "FOOTBALL_DATA_API_KEY missing" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let imported = 0;
  let updated = 0;
  for (const code of COMPETITIONS) {
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/competitions/${code}/matches?status=SCHEDULED,TIMED`,
        { headers: { "X-Auth-Token": key } },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { matches?: FdMatch[] };
      for (const m of json.matches ?? []) {
        const external_id = `fd:${m.id}`;
        const kickoff = new Date(m.utcDate).toISOString();
        const visible_from = new Date(
          new Date(m.utcDate).getTime() - 24 * 60 * 60 * 1000,
        ).toISOString();
        const row = {
          external_id,
          team1: m.homeTeam.name,
          team1_flag: flagFor(m.homeTeam.tla),
          team2: m.awayTeam.name,
          team2_flag: flagFor(m.awayTeam.tla),
          competition: m.competition.name,
          kickoff,
          visible_from,
          status: "upcoming" as const,
        };
        const { data: existing } = await supabaseAdmin
          .from("matches")
          .select("id, kickoff, status")
          .eq("external_id", external_id)
          .maybeSingle();
        if (existing) {
          if (existing.status === "upcoming") {
            await supabaseAdmin.from("matches").update(row).eq("id", existing.id);
            updated++;
          }
        } else {
          await supabaseAdmin.from("matches").insert(row);
          imported++;
        }
      }
    } catch (_e) {
      // continue
    }
  }

  await supabaseAdmin
    .from("sync_state")
    .upsert({ key: "football-data", last_run_at: new Date().toISOString(), payload: { imported, updated } });

  // Send "predictions open" pushes for matches whose visible_from has passed but not yet notified.
  const nowIso = new Date().toISOString();
  const { data: newlyOpen } = await supabaseAdmin
    .from("matches")
    .select("id, team1, team2, kickoff")
    .lte("visible_from", nowIso)
    .gt("kickoff", nowIso)
    .is("open_notified_at", null)
    .eq("status", "upcoming");

  let pushed = 0;
  for (const m of newlyOpen ?? []) {
    try {
      await sendPushToAll({
        title: "Predictions open ⚽",
        body: `${m.team1} vs ${m.team2} — pick your winner now.`,
        url: "/",
        tag: `open-${m.id}`,
      });
    } catch (_e) {
      // ignore push errors
    }
    await supabaseAdmin
      .from("matches")
      .update({ open_notified_at: new Date().toISOString() })
      .eq("id", m.id);
    pushed++;
  }

  return { ok: true, imported, updated, pushed };
}

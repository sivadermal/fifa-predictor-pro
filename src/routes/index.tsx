import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listMatches,
  getMyPredictions,
  submitPrediction,
} from "@/lib/predictions.functions";
import { Countdown } from "@/components/countdown";
import { UsernameGate, useProfile } from "@/components/username-gate";
import { getDeviceId } from "@/lib/device";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matches — FIFA Winner Predictor" },
      { name: "description", content: "Browse upcoming FIFA matches and lock in your winner predictions." },
      { property: "og:title", content: "Matches — FIFA Winner Predictor" },
      { property: "og:description", content: "Predict winners of upcoming FIFA matches." },
    ],
  }),
  component: HomePage,
});

type Match = {
  id: string;
  team1: string;
  team1_flag: string | null;
  team2: string;
  team2_flag: string | null;
  competition: string;
  kickoff: string;
  status: "upcoming" | "live" | "completed" | "cancelled";
  team1_score: number | null;
  team2_score: number | null;
  winner: "team1" | "draw" | "team2" | null;
};

type Pred = { id: string; match_id: string; pick: "team1" | "draw" | "team2"; is_correct: boolean | null; points: number };

function HomePage() {
  const { profile, setProfile, ready } = useProfile();

  return ready ? (
    <UsernameGate profile={profile} onRegistered={setProfile}>
      <Dashboard profileId={profile?.id ?? null} />
    </UsernameGate>
  ) : (
    <div className="py-20 text-center text-muted-foreground">Loading…</div>
  );
}

function Dashboard({ profileId }: { profileId: string | null }) {
  const fetchMatches = useServerFn(listMatches);
  const fetchPreds = useServerFn(getMyPredictions);
  const matches = useQuery({ queryKey: ["matches"], queryFn: () => fetchMatches(), refetchInterval: 30000 });
  const myPreds = useQuery({
    queryKey: ["my-preds", profileId],
    queryFn: () => fetchPreds({ data: { deviceId: getDeviceId() } }),
    enabled: !!profileId,
  });

  const predMap = useMemo(() => {
    const m = new Map<string, Pred>();
    (myPreds.data ?? []).forEach((p) => m.set(p.match_id, p as Pred));
    return m;
  }, [myPreds.data]);

  const groups = useMemo(() => {
    const all = (matches.data ?? []) as Match[];
    const now = Date.now();
    const openWindow = 24 * 60 * 60 * 1000;
    const open: Match[] = [];
    const upcoming: Match[] = [];
    const live: Match[] = [];
    const completed: Match[] = [];
    for (const m of all) {
      if (m.status === "cancelled") continue;
      if (m.status === "completed") { completed.push(m); continue; }
      if (m.status === "live") { live.push(m); continue; }
      const t = new Date(m.kickoff).getTime();
      if (t <= now) live.push(m);
      else if (t - now <= openWindow) open.push(m);
      else upcoming.push(m);
    }
    return { open, upcoming, live, completed };
  }, [matches.data]);

  if (matches.isLoading) return <div className="py-20 text-center text-muted-foreground">Loading matches…</div>;
  if (!matches.data?.length) {
    return (
      <div className="pitch-card mx-auto max-w-xl p-10 text-center">
        <h2 className="text-2xl font-bold">No matches yet</h2>
        <p className="mt-2 text-muted-foreground">An admin will publish fixtures shortly. Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Section title="Prediction open" matches={groups.open} predMap={predMap} state="open" />
      <Section title="Live" matches={groups.live} predMap={predMap} state="live" />
      <Section title="Upcoming" matches={groups.upcoming} predMap={predMap} state="upcoming" />
      <Section title="Completed" matches={groups.completed} predMap={predMap} state="completed" />
    </div>
  );
}

function Section({
  title,
  matches,
  predMap,
  state,
}: {
  title: string;
  matches: Match[];
  predMap: Map<string, Pred>;
  state: "open" | "live" | "upcoming" | "completed";
}) {
  if (matches.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <Badge variant="secondary">{matches.length}</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {matches.map((m) => (
          <MatchCard key={m.id} match={m} pick={predMap.get(m.id)} state={state} />
        ))}
      </div>
    </section>
  );
}

function MatchCard({
  match,
  pick,
  state,
}: {
  match: Match;
  pick?: Pred;
  state: "open" | "live" | "upcoming" | "completed";
}) {
  const qc = useQueryClient();
  const submit = useServerFn(submitPrediction);
  const [local, setLocal] = useState<Pred["pick"] | undefined>(pick?.pick);
  const current = local ?? pick?.pick;

  const mut = useMutation({
    mutationFn: (p: Pred["pick"]) =>
      submit({ data: { deviceId: getDeviceId(), matchId: match.id, pick: p } }),
    onSuccess: (_d, p) => {
      setLocal(p);
      toast.success("Prediction saved");
      qc.invalidateQueries({ queryKey: ["my-preds"] });
    },
    onError: (err: Error) => {
      const map: Record<string, string> = {
        PREDICTION_NOT_OPEN: "Predictions open 24 hours before kickoff.",
        PREDICTION_CLOSED: "Predictions are closed for this match.",
        MATCH_COMPLETED: "Match is already completed.",
        MATCH_CANCELLED: "Match was cancelled.",
        USER_DISABLED: "Your account has been disabled.",
        USER_NOT_FOUND: "Please refresh and try again.",
      };
      toast.error(map[err.message] ?? err.message);
    },
  });

  const locked = state !== "open";
  const isCompleted = state === "completed";

  return (
    <div className="pitch-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {match.competition}
        </span>
        <StatusBadge state={state} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5">
        <TeamSide name={match.team1} flag={match.team1_flag} align="left" score={isCompleted ? match.team1_score : null} />
        <div className="text-center">
          <div className="text-xs text-muted-foreground">
            {new Date(match.kickoff).toLocaleString(undefined, {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </div>
          {isCompleted ? (
            <div className="mt-1 text-2xl font-bold">
              {match.team1_score}<span className="mx-1 text-muted-foreground">–</span>{match.team2_score}
            </div>
          ) : (
            <div className="mt-1 text-sm gold-text">
              <Countdown to={match.kickoff} prefix={state === "live" ? "" : "kickoff in "} />
            </div>
          )}
        </div>
        <TeamSide name={match.team2} flag={match.team2_flag} align="right" score={isCompleted ? match.team2_score : null} />
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/60 bg-background/30 p-3">
        <PickButton label={`${match.team1} win`} active={current === "team1"} correct={isCompleted && pick?.pick === "team1" ? pick.is_correct : null} disabled={locked || mut.isPending} onClick={() => mut.mutate("team1")} />
        <PickButton label="Draw" active={current === "draw"} correct={isCompleted && pick?.pick === "draw" ? pick?.is_correct : null} disabled={locked || mut.isPending} onClick={() => mut.mutate("draw")} />
        <PickButton label={`${match.team2} win`} active={current === "team2"} correct={isCompleted && pick?.pick === "team2" ? pick?.is_correct : null} disabled={locked || mut.isPending} onClick={() => mut.mutate("team2")} />
      </div>

      {state === "upcoming" && (
        <div className="border-t border-border/60 px-5 py-2 text-center text-xs text-muted-foreground">
          Predictions open <Countdown to={new Date(new Date(match.kickoff).getTime() - 24 * 60 * 60 * 1000)} prefix="in " />
        </div>
      )}
      {state === "live" && (
        <div className="border-t border-border/60 px-5 py-2 text-center text-xs text-muted-foreground">
          Match started. Predictions locked.
        </div>
      )}
      {isCompleted && pick && (
        <div className="border-t border-border/60 px-5 py-2 text-center text-xs">
          {pick.is_correct ? (
            <span className="gold-text font-semibold">✓ Correct — +1 point</span>
          ) : (
            <span className="text-muted-foreground">Better luck next match</span>
          )}
        </div>
      )}
    </div>
  );
}

function TeamSide({ name, flag, align, score }: { name: string; flag: string | null; align: "left" | "right"; score: number | null }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-2xl">{flag || "🏳️"}</div>
      <div>
        <div className="font-semibold leading-tight">{name}</div>
        {score !== null && <div className="text-xs text-muted-foreground">scored {score}</div>}
      </div>
    </div>
  );
}

function PickButton({
  label, active, disabled, onClick, correct,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  correct?: boolean | null;
}) {
  const tone =
    correct === true
      ? "border-[var(--gold)] bg-[color-mix(in_oklch,var(--gold)_25%,transparent)] text-foreground"
      : correct === false
        ? "border-destructive/60 bg-destructive/10 text-foreground"
        : active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-background/60 text-foreground hover:bg-secondary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-2 text-xs font-medium transition disabled:opacity-60 disabled:cursor-not-allowed ${tone}`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ state }: { state: "open" | "live" | "upcoming" | "completed" }) {
  const map = {
    open: { text: "Predict now", cls: "bg-primary text-primary-foreground" },
    live: { text: "● Live", cls: "bg-destructive text-destructive-foreground" },
    upcoming: { text: "Upcoming", cls: "bg-secondary text-secondary-foreground" },
    completed: { text: "Final", cls: "bg-muted text-muted-foreground" },
  } as const;
  const s = map[state];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>{s.text}</span>;
}

// Unused but referenced previously
void Button;

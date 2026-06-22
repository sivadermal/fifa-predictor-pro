import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  adminLogin, adminLogout, adminMe,
  adminCreateMatch, adminUpdateMatch, adminDeleteMatch,
  adminSetResult, adminRecalculate,
  adminListUsers, adminToggleUser, adminListPredictions,
  adminAdjustPoints, adminDeleteUser, adminImportMatches,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listMatches as listMatchesFn } from "@/lib/predictions.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — FIFA Winner Predictor" }, { name: "robots", content: "noindex" }] }),
  component: AdminPage,
});

function AdminPage() {
  const meFn = useServerFn(adminMe);
  const me = useQuery({ queryKey: ["admin-me"], queryFn: () => meFn() });
  if (me.isLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  return me.data?.isAdmin ? <AdminShell /> : <LoginForm />;
}

function LoginForm() {
  const qc = useQueryClient();
  const login = useServerFn(adminLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const mut = useMutation({
    mutationFn: () => login({ data: { username, password } }),
    onSuccess: () => { toast.success("Welcome, admin"); qc.invalidateQueries({ queryKey: ["admin-me"] }); },
    onError: (e: Error) => toast.error(e.message === "INVALID_CREDENTIALS" ? "Invalid credentials" : e.message),
  });
  return (
    <div className="mx-auto max-w-sm">
      <div className="pitch-card p-6">
        <h1 className="text-2xl font-bold">Admin sign in</h1>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>
            {mut.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function AdminShell() {
  const qc = useQueryClient();
  const logout = useServerFn(adminLogout);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin</h1>
        <Button
          variant="outline"
          onClick={async () => { await logout(); qc.invalidateQueries({ queryKey: ["admin-me"] }); }}
        >Sign out</Button>
      </div>
      <Tabs defaultValue="matches">
        <TabsList>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="users">Users & Points</TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
        </TabsList>
        <TabsContent value="matches"><MatchesTab /></TabsContent>
        <TabsContent value="results"><ResultsTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="predictions"><PredictionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function MatchesTab() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesFn);
  const matches = useQuery({ queryKey: ["admin-matches"], queryFn: () => listMatches() });

  const create = useServerFn(adminCreateMatch);
  const update = useServerFn(adminUpdateMatch);
  const del = useServerFn(adminDeleteMatch);

  const [form, setForm] = useState({
    team1: "", team1_flag: "🏳️", team2: "", team2_flag: "🏳️",
    competition: "FIFA World Cup", kickoff: "",
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-matches"] });

  const createMut = useMutation({
    mutationFn: () => create({ data: { ...form, kickoff: new Date(form.kickoff).toISOString() } }),
    onSuccess: () => { toast.success("Match created"); refresh(); setForm({ ...form, team1: "", team2: "", kickoff: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const importNow = useServerFn(adminImportMatches);

  return (
    <div className="mt-4 space-y-6">
      <div className="pitch-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="font-semibold">Auto-import from Football-Data.org</div>
          <div className="text-xs text-muted-foreground">FIFA WC, UEFA Champions League, Euros · hidden until 24h before kickoff</div>
        </div>
        <Button variant="outline" onClick={async () => {
          const r = await importNow();
          if (r.ok) toast.success(`Imported ${r.imported}, updated ${r.updated}, pushed ${r.pushed}`);
          else toast.error(r.error ?? "Import failed");
          qc.invalidateQueries({ queryKey: ["admin-matches"] });
        }}>Import now</Button>
      </div>

      <div className="pitch-card p-5">
        <h3 className="font-semibold">Create match</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <div><Label>Team 1</Label><Input value={form.team1} onChange={(e) => setForm({ ...form, team1: e.target.value })} /></div>
          <div><Label>Team 1 flag (emoji)</Label><Input value={form.team1_flag} onChange={(e) => setForm({ ...form, team1_flag: e.target.value })} /></div>
          <div><Label>Team 2</Label><Input value={form.team2} onChange={(e) => setForm({ ...form, team2: e.target.value })} /></div>
          <div><Label>Team 2 flag (emoji)</Label><Input value={form.team2_flag} onChange={(e) => setForm({ ...form, team2_flag: e.target.value })} /></div>
          <div><Label>Competition</Label><Input value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} /></div>
          <div><Label>Kickoff</Label><Input type="datetime-local" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} /></div>
        </div>
        <Button className="mt-4" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.team1 || !form.team2 || !form.kickoff}>
          {createMut.isPending ? "Creating…" : "Create"}
        </Button>
      </div>

      <div className="pitch-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Match</th>
              <th className="px-3 py-2 text-left">Kickoff</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(matches.data ?? []).map((m) => (
              <tr key={m.id} className="border-t border-border/40">
                <td className="px-3 py-2">{m.team1_flag} {m.team1} vs {m.team2} {m.team2_flag}</td>
                <td className="px-3 py-2">{new Date(m.kickoff).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <select
                    defaultValue={m.status}
                    onChange={async (e) => {
                      await update({ data: { id: m.id, patch: { status: e.target.value as "upcoming" | "live" | "completed" | "cancelled" } } });
                      toast.success("Updated"); refresh();
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="live">Live</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={async () => {
                    if (!confirm("Delete this match? Predictions will be removed.")) return;
                    await del({ data: { id: m.id } }); toast.success("Deleted"); refresh();
                  }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResultsTab() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesFn);
  const matches = useQuery({ queryKey: ["admin-matches"], queryFn: () => listMatches() });
  const setResult = useServerFn(adminSetResult);
  const recalc = useServerFn(adminRecalculate);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={async () => {
          const r = await recalc(); toast.success(`Recalculated (${r.updated})`);
          qc.invalidateQueries({ queryKey: ["admin-matches"] });
        }}>Recalculate all points</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {(matches.data ?? []).filter((m) => m.status !== "cancelled").map((m) => (
          <ResultRow key={m.id} m={m} onSubmit={async (s1, s2) => {
            await setResult({ data: { id: m.id, team1_score: s1, team2_score: s2 } });
            toast.success("Result saved & points awarded");
            qc.invalidateQueries({ queryKey: ["admin-matches"] });
          }} />
        ))}
      </div>
    </div>
  );
}

type AdminMatch = {
  id: string; team1: string; team2: string; kickoff: string; status: string;
  team1_score: number | null; team2_score: number | null; winner: string | null;
};

function ResultRow({ m, onSubmit }: { m: AdminMatch; onSubmit: (s1: number, s2: number) => Promise<void> }) {
  const [s1, setS1] = useState<number>(m.team1_score ?? 0);
  const [s2, setS2] = useState<number>(m.team2_score ?? 0);
  return (
    <div className="pitch-card p-4">
      <div className="text-sm font-semibold">{m.team1} vs {m.team2}</div>
      <div className="text-xs text-muted-foreground">{new Date(m.kickoff).toLocaleString()} · {m.status}</div>
      <div className="mt-3 flex items-end gap-2">
        <Input type="number" min={0} value={s1} onChange={(e) => setS1(Number(e.target.value))} className="w-20" />
        <span className="pb-2 text-muted-foreground">–</span>
        <Input type="number" min={0} value={s2} onChange={(e) => setS2(Number(e.target.value))} className="w-20" />
        <Button onClick={() => onSubmit(s1, s2)} className="ml-auto">Save result</Button>
      </div>
      {m.winner && <div className="mt-2 text-xs gold-text">Winner: {m.winner}</div>}
    </div>
  );
}

type AdminUser = {
  id: string; user_id: string; name: string; disabled: boolean; created_at: string;
  total_points: number; total_predictions: number; correct_predictions: number;
};

function UsersTab() {
  const qc = useQueryClient();
  const list = useServerFn(adminListUsers);
  const toggle = useServerFn(adminToggleUser);
  const adjust = useServerFn(adminAdjustPoints);
  const del = useServerFn(adminDeleteUser);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  return (
    <div className="pitch-card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">User</th>
            <th className="px-3 py-2 text-left">Registered</th>
            <th className="px-3 py-2 text-right">Preds</th>
            <th className="px-3 py-2 text-right">Correct</th>
            <th className="px-3 py-2 text-right">Points</th>
            <th className="px-3 py-2 text-left">Adjust</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {(users.data ?? []).map((u: AdminUser) => (
            <UserRow key={u.id} u={u} onAdjust={async (delta, reason) => {
              await adjust({ data: { userId: u.id, delta, reason } });
              toast.success(`${delta >= 0 ? "+" : ""}${delta} points`);
              refresh();
            }} onToggle={async () => {
              await toggle({ data: { id: u.id, disabled: !u.disabled } });
              toast.success(u.disabled ? "Enabled" : "Disabled"); refresh();
            }} onDelete={async () => {
              if (!confirm(`Delete user @${u.user_id}? This removes all their predictions.`)) return;
              await del({ data: { id: u.id } }); toast.success("User deleted"); refresh();
            }} />
          ))}
          {!users.isLoading && (users.data ?? []).length === 0 && (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No users yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({
  u, onAdjust, onToggle, onDelete,
}: {
  u: AdminUser;
  onAdjust: (delta: number, reason?: string) => Promise<void>;
  onToggle: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-2">
        <div className="font-medium">{u.name}{u.disabled && <span className="ml-2 text-xs text-destructive">disabled</span>}</div>
        <div className="text-xs text-muted-foreground">@{u.user_id}</div>
      </td>
      <td className="px-3 py-2">{new Date(u.created_at).toLocaleDateString()}</td>
      <td className="px-3 py-2 text-right tabular-nums">{u.total_predictions}</td>
      <td className="px-3 py-2 text-right tabular-nums">{u.correct_predictions}</td>
      <td className="px-3 py-2 text-right tabular-nums font-bold">{u.total_points}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Input value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±N" className="w-16" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason" className="w-28" />
          <Button size="sm" variant="outline" onClick={async () => {
            const n = parseInt(delta, 10);
            if (Number.isNaN(n) || n === 0) return toast.error("Enter a non-zero number");
            await onAdjust(n, reason || undefined); setDelta(""); setReason("");
          }}>Apply</Button>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <Button variant="ghost" size="sm" onClick={onToggle}>{u.disabled ? "Enable" : "Disable"}</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive">Delete</Button>
      </td>
    </tr>
  );
}

type AdminPred = {
  id: string; match_id: string; user_id: string; pick: string;
  is_correct: boolean | null; points: number; created_at: string;
  profile: { user_id: string; name: string } | null;
  match: { team1: string; team2: string } | null;
};

function PredictionsTab() {
  const list = useServerFn(adminListPredictions);
  const preds = useQuery({ queryKey: ["admin-preds"], queryFn: () => list() });

  const exportCsv = () => {
    const rows = preds.data ?? [];
    const header = ["user", "match", "pick", "is_correct", "points", "created_at"];
    const csv = [
      header.join(","),
      ...rows.map((r: AdminPred) =>
        [
          `@${r.profile?.user_id ?? r.user_id}`,
          `${r.match?.team1 ?? "?"} vs ${r.match?.team2 ?? "?"}`,
          r.pick,
          r.is_correct ?? "",
          r.points,
          r.created_at,
        ].map((v) => JSON.stringify(String(v))).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "predictions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end"><Button variant="outline" onClick={exportCsv}>Export CSV</Button></div>
      <div className="pitch-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Match</th>
              <th className="px-3 py-2 text-left">Pick</th>
              <th className="px-3 py-2 text-right">Points</th>
              <th className="px-3 py-2 text-left">When</th>
            </tr>
          </thead>
          <tbody>
            {(preds.data ?? []).map((p: AdminPred) => (
              <tr key={p.id} className="border-t border-border/40">
                <td className="px-3 py-2">
                  {p.profile ? <>
                    <div className="font-medium">{p.profile.name}</div>
                    <div className="text-xs text-muted-foreground">@{p.profile.user_id}</div>
                  </> : <span className="font-mono text-xs">{p.user_id.slice(0, 8)}</span>}
                </td>
                <td className="px-3 py-2">{p.match ? `${p.match.team1} vs ${p.match.team2}` : "—"}</td>
                <td className="px-3 py-2">{p.pick}{p.is_correct === true ? " ✓" : p.is_correct === false ? " ✗" : ""}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.points}</td>
                <td className="px-3 py-2">{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

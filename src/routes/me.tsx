import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe } from "@/lib/predictions.functions";
import { AuthGate } from "@/components/auth-gate";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: "My Stats — FIFA Winner Predictor" },
      { name: "description", content: "Track your predictions, points, and rank." },
    ],
  }),
  component: MePage,
});

function MePage() {
  return (
    <AuthGate>
      <Stats />
    </AuthGate>
  );
}

function Stats() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), refetchInterval: 20000 });
  const d = me.data;
  if (!d) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  const tiles = [
    { label: "Total predictions", value: d.total_predictions },
    { label: "Correct", value: d.correct_predictions },
    { label: "Total points", value: d.total_points },
    { label: "Accuracy", value: `${d.accuracy}%` },
    { label: "Rank", value: d.rank ? `#${d.rank}` : "—" },
  ];
  return (
    <div>
      <h1 className="text-3xl font-bold">{d.name}</h1>
      <p className="mt-1 text-muted-foreground">@{d.user_id}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="pitch-card p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{t.label}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

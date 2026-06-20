import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLeaderboard } from "@/lib/predictions.functions";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — FIFA Winner Predictor" },
      { name: "description", content: "Global leaderboard of top FIFA match predictors." },
      { property: "og:title", content: "Leaderboard — FIFA Winner Predictor" },
      { property: "og:description", content: "See who's leading the predictions." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const fetchLb = useServerFn(getLeaderboard);
  const lb = useQuery({ queryKey: ["leaderboard"], queryFn: () => fetchLb(), refetchInterval: 15000 });

  return (
    <div>
      <h1 className="text-3xl font-bold">Leaderboard</h1>
      <p className="mt-1 text-muted-foreground">Live rankings, updated automatically.</p>

      <div className="pitch-card mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-background/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Correct</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">Total</th>
              <th className="px-4 py-3 text-right">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {(lb.data ?? []).map((r) => (
              <tr key={r.user_id} className="border-t border-border/40">
                <td className="px-4 py-3 font-semibold">
                  {r.rank && r.rank <= 3 ? <span className="gold-text">#{r.rank}</span> : <>#{r.rank}</>}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">@{r.handle}</div>
                </td>
                <td className="px-4 py-3 text-right font-bold tabular-nums">{r.total_points}</td>
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">{r.correct_predictions}</td>
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">{r.total_predictions}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.accuracy}%</td>
              </tr>
            ))}
            {!lb.isLoading && (lb.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No predictions yet. Be the first!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

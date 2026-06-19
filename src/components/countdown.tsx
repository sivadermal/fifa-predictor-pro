import { useEffect, useState } from "react";

export function Countdown({ to, prefix = "" }: { to: string | Date; prefix?: string }) {
  const target = typeof to === "string" ? new Date(to) : to;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const ms = target.getTime() - now;
  if (ms <= 0) return <span className="text-muted-foreground">started</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return <span className="tabular-nums">{prefix}{parts}</span>;
}

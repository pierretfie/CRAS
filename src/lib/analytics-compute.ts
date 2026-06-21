import type { Tables } from "@/integrations/supabase/types";

export type ClientRow = Tables<"clients">;
export type StageEventRow = Tables<"client_stage_events">;
export type ProfileRow = Tables<"profiles">;

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export function computeAnalytics(
  clients: ClientRow[],
  events: StageEventRow[],
  profiles: ProfileRow[],
) {
  const total = clients.length;
  const stage3 = clients.filter((c) => c.current_stage === 3 && c.stage_value === 1).length;
  const won = clients.filter((c) => c.status === "won").length;
  const lost = clients.filter((c) => c.status === "lost").length;
  const active = clients.filter((c) => c.status === "active").length;
  const conversion = total ? stage3 / total : 0;

  const funnel = [1, 2, 3].map((stage) => ({
    stage: `Stage ${stage}`,
    count: clients.filter((c) => c.current_stage === stage && c.status === "active").length,
  }));

  const byMode: Record<string, number> = {};
  for (const c of clients) byMode[c.mode_of_connection] = (byMode[c.mode_of_connection] ?? 0) + 1;

  const byCategory: Record<string, number> = {};
  for (const c of clients) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;

  const wonByCategory: Record<string, number> = {};
  for (const c of clients.filter((c) => c.status === "won"))
    wonByCategory[c.category] = (wonByCategory[c.category] ?? 0) + 1;

  // Per-user wins
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const winsByUser: Record<string, number> = {};
  for (const c of clients.filter((c) => c.status === "won"))
    winsByUser[c.created_by] = (winsByUser[c.created_by] ?? 0) + 1;
  const topUsers = Object.entries(winsByUser)
    .map(([id, wins]) => ({ id, name: profileById.get(id)?.name ?? "Unknown", wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 5);

  // Time series (last 8 weeks)
  const buckets: { label: string; count: number; date: Date }[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    buckets.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: 0,
      date: d,
    });
  }
  for (const c of clients) {
    const t = new Date(c.created_at).getTime();
    for (let i = 0; i < buckets.length; i++) {
      const start = buckets[i].date.getTime();
      const end = i < buckets.length - 1 ? buckets[i + 1].date.getTime() : start + 7 * 24 * 60 * 60 * 1000;
      if (t >= start && t < end) {
        buckets[i].count++;
        break;
      }
    }
  }

  // Stale = active, no stage event in 30d
  const lastEventByClient = new Map<string, number>();
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    const cur = lastEventByClient.get(e.client_id) ?? 0;
    if (t > cur) lastEventByClient.set(e.client_id, t);
  }
  const nowMs = Date.now();
  const staleClients = clients.filter((c) => {
    if (c.status !== "active") return false;
    const last = lastEventByClient.get(c.id) ?? new Date(c.created_at).getTime();
    return nowMs - last > THIRTY_DAYS;
  });

  const bestCategory = Object.entries(wonByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Product aggregations. null → "Unspecified" so existing rows are visible
  // in the dashboards rather than silently dropped. "Enquired" mirrors the
  // existing funnel definition (status='active') to keep semantics aligned.
  const UNSPECIFIED = "Unspecified";
  const bucketProduct = (v: string | null) =>
    v && v.trim() ? v : UNSPECIFIED;
  const byProduct: Record<string, number> = {};
  const wonByProduct: Record<string, number> = {};
  const enquiredByProduct: Record<string, number> = {};
  for (const c of clients) {
    const key = bucketProduct(c.product);
    byProduct[key] = (byProduct[key] ?? 0) + 1;
    if (c.status === "won") wonByProduct[key] = (wonByProduct[key] ?? 0) + 1;
    if (c.status === "active") enquiredByProduct[key] = (enquiredByProduct[key] ?? 0) + 1;
  }

  return {
    total,
    active,
    won,
    lost,
    stage3,
    conversion,
    funnel,
    byMode,
    byCategory,
    wonByCategory,
    topUsers,
    timeseries: buckets.map((b) => ({ label: b.label, count: b.count })),
    staleClients,
    stale: staleClients.length,
    bestCategory,
    byProduct,
    wonByProduct,
    enquiredByProduct,
  };
}

export type AnalyticsResult = ReturnType<typeof computeAnalytics>;

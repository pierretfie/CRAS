import type { Tables } from "@/integrations/supabase/types";

export type ClientRow = Tables<"clients">;
// Extend StageEventRow to include the interest_scale column added in migration
// 20260701000002. The generated types may not reflect this yet, so we augment.
export type StageEventRow = Tables<"client_stage_events"> & { interest_scale?: number | null };
export type ProfileRow = Tables<"profiles">;
export type FollowUpRow = { client_id: string; status: string };
export type FollowUpLogRow = {
  follow_up_id: string;
  client_id: string;
  user_id: string;
  activity_type: string | null;
  logged_at: string;
};

const STALE_DAYS = 14 * 24 * 60 * 60 * 1000; // 14-day stale threshold (14d)

function avgInterest(clients: ClientRow[]): number | null {
  const vals = clients.map((c) => Number(c.interest_scale)).filter((v) => !isNaN(v) && v > 0);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeAnalytics(
  clients: ClientRow[],
  events: StageEventRow[],
  profiles: ProfileRow[],
  followUps: FollowUpRow[],
  followUpLogs: FollowUpLogRow[] = [],
  // anchorMs: the reference "now" for stale/trend windows.
  // Pass the period end when computing for a historical period so that
  // the 14-day trend shows the tail of that period, not today.
  anchorMs: number = Date.now(),
  // filterUserId: when set, per-rep metrics only show this user's stats
  // (used in "Your Data" mode to hide other team members from the breakdown)
  filterUserId: string | null = null,
) {
  const total = clients.length;
  const stage3 = clients.filter((c) => c.current_stage === 3).length;
  const won = clients.filter((c) => c.status === "won").length;
  const lost = clients.filter((c) => c.status === "lost").length;
  const active = clients.filter((c) => c.status === "active").length;
  const decided = won + lost;
  // Win Rate: won ÷ (won + lost) — only decided deals
  const winRate = decided > 0 ? won / decided : 0;
  // Close Rate: won ÷ total leads (all clients ever entered) — full funnel view
  const closeRate = total > 0 ? won / total : 0;
  // Keep conversion as winRate for backward compat with AI context
  const conversion = winRate;

  // Opportunity-to-Close Rate: won ÷ clients who ever reached Stage 2+
  // Stage 2+ = qualified opportunity (actively engaged, not just an initial lead)
  // Only include lost clients who actually reached Stage 2+ (not Stage-1 losses).
  const qualifiedOpportunities = clients.filter(
    (c) => c.current_stage >= 2 || c.status === "won" || (c.status === "lost" && c.current_stage >= 2)
  ).length;
  const otcRate = qualifiedOpportunities > 0 ? won / qualifiedOpportunities : 0;

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

  // Per-user wins — credit goes to whoever pushed the "won" event (the closer)
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const winsByUser: Record<string, number> = {};
  for (const e of events.filter((e) => e.event_type === "won")) {
    winsByUser[e.user_id] = (winsByUser[e.user_id] ?? 0) + 1;
  }
  const topUsers = Object.entries(winsByUser)
    .filter(([id]) => !filterUserId || id === filterUserId)
    .map(([id, wins]) => ({ id, name: profileById.get(id)?.name ?? "Unknown", wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 5);

  // Per-user sourcing — credit goes to whoever added the client (created_by)
  const clientsByUser: Record<string, number> = {};
  for (const c of clients) {
    clientsByUser[c.created_by] = (clientsByUser[c.created_by] ?? 0) + 1;
  }
  const topSourcers = Object.entries(clientsByUser)
    .filter(([id]) => !filterUserId || id === filterUserId)
    .map(([id, added]) => ({ id, name: profileById.get(id)?.name ?? "Unknown", added }))
    .sort((a, b) => b.added - a.added)
    .slice(0, 5);

  // Time series (last 8 weeks relative to anchor)
  const buckets: { label: string; count: number; date: Date }[] = [];
  const now = new Date(anchorMs);
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

  // Stale = active, no stage event in 14d
  const lastEventByClient = new Map<string, number>();
  for (const e of events) {
    const t = new Date(e.created_at).getTime();
    const cur = lastEventByClient.get(e.client_id) ?? 0;
    if (t > cur) lastEventByClient.set(e.client_id, t);
  }
  const nowMs = anchorMs;
  const staleClients = clients
    .filter((c) => {
      if (c.status !== "active") return false;
      const last = lastEventByClient.get(c.id) ?? new Date(c.created_at).getTime();
      return nowMs - last > STALE_DAYS;
    })
    .map((c) => {
      const last = lastEventByClient.get(c.id) ?? new Date(c.created_at).getTime();
      return { ...c, daysSinceActivity: Math.floor((nowMs - last) / (1000 * 60 * 60 * 24)) };
    });

  const bestCategory = Object.entries(wonByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Product aggregations
  const UNSPECIFIED = "Unspecified";
  const bucketProduct = (v: string | null) => (v && v.trim() ? v : UNSPECIFIED);
  const byProduct: Record<string, number> = {};
  const wonByProduct: Record<string, number> = {};
  const enquiredByProduct: Record<string, number> = {};
  for (const c of clients) {
    const key = bucketProduct(c.product);
    byProduct[key] = (byProduct[key] ?? 0) + 1;
    if (c.status === "won") wonByProduct[key] = (wonByProduct[key] ?? 0) + 1;
    if (c.status === "active") enquiredByProduct[key] = (enquiredByProduct[key] ?? 0) + 1;
  }

  // ── Sales Velocity (non-financial) ───────────────────────────────────────
  // Formula: Qualified Opps × OTC Rate ÷ Avg Sales Cycle (days)
  // Avg cycle = mean days from client created_at to the "won" stage event
  const wonEvents = events.filter((e) => e.event_type === "won");
  const cycleDays: number[] = [];
  // Also track per-rep cycle days (keyed by user_id of the "won" event)
  const cycleDaysByRep = new Map<string, number[]>();
  for (const e of wonEvents) {
    const client = clients.find((c) => c.id === e.client_id);
    if (!client) continue;
    const days = (new Date(e.created_at).getTime() - new Date(client.created_at).getTime())
      / (1000 * 60 * 60 * 24);
    if (days >= 0) {
      cycleDays.push(days);
      if (!cycleDaysByRep.has(e.user_id)) cycleDaysByRep.set(e.user_id, []);
      cycleDaysByRep.get(e.user_id)!.push(days);
    }
  }
  const avgCycleDays = cycleDays.length > 0
    ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
    : null;
  // Result = deals closed per day
  const salesVelocity = avgCycleDays && avgCycleDays > 0 && qualifiedOpportunities > 0
    ? (qualifiedOpportunities * otcRate) / avgCycleDays
    : null;

  // ── Sales Cycle Length — detailed stats ──────────────────────────────────
  // Sort for median / min / max
  const sortedCycleDays = [...cycleDays].sort((a, b) => a - b);
  const medianCycleDays = sortedCycleDays.length > 0
    ? sortedCycleDays.length % 2 === 0
      ? (sortedCycleDays[sortedCycleDays.length / 2 - 1] + sortedCycleDays[sortedCycleDays.length / 2]) / 2
      : sortedCycleDays[Math.floor(sortedCycleDays.length / 2)]
    : null;
  const minCycleDays = sortedCycleDays.length > 0 ? sortedCycleDays[0] : null;
  const maxCycleDays = sortedCycleDays.length > 0 ? sortedCycleDays[sortedCycleDays.length - 1] : null;

  // Per-rep average cycle: each rep's mean days across their won deals
  // In "Your Data" mode (filterUserId set), only show the filtered user's stats
  const cycleByRep = [...cycleDaysByRep.entries()]
    .filter(([userId]) => !filterUserId || userId === filterUserId)
    .map(([userId, days]) => {
      const avg = days.reduce((a, b) => a + b, 0) / days.length;
      return { userId, name: profileById.get(userId)?.name ?? "Unknown", avg, deals: days.length };
    })
    .sort((a, b) => a.avg - b.avg); // fastest closer first

  // ── Average interest by status — entry and close ─────────────────────────
  // Entry interest = clients.interest_scale (set at creation, never overwritten).
  //                  Used for ALL statuses (active, won, lost).
  // Close interest = interest_scale on the won/lost closing event.
  //                  Only available for decided deals.
  //
  // Active entry uses clients.interest_scale directly — these deals are still
  // open so there is no closing interest yet.

  // Build entry interest map from creation events (from_stage IS NULL)
  // Falls back to clients.interest_scale for clients without a creation event record.
  const creationInterestByClientId = new Map<string, number>();
  for (const e of events) {
    if (e.from_stage == null && e.interest_scale != null && !isNaN(Number(e.interest_scale))) {
      if (!creationInterestByClientId.has(e.client_id)) {
        creationInterestByClientId.set(e.client_id, Number(e.interest_scale));
      }
    }
  }

  function getEntryInterest(c: ClientRow): number | null {
    if (creationInterestByClientId.has(c.id)) return creationInterestByClientId.get(c.id)!;
    const v = Number(c.interest_scale);
    return !isNaN(v) && v > 0 ? v : null;
  }

  // Close interest map from won/lost events
  const closeInterestByClientId = new Map<string, number>();
  for (const e of events) {
    if ((e.event_type === "won" || e.event_type === "lost") &&
        e.interest_scale != null && !isNaN(Number(e.interest_scale))) {
      // Take the most recent closing event per client
      const existing = closeInterestByClientId.get(e.client_id);
      if (existing === undefined) closeInterestByClientId.set(e.client_id, Number(e.interest_scale));
    }
  }

  function avgValues(vals: (number | null)[]): number | null {
    const nums = vals.filter((v): v is number => v !== null && !isNaN(v) && v >= 0);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  }

  const activeClients = clients.filter((c) => c.status === "active");
  const wonClients    = clients.filter((c) => c.status === "won");
  const lostClients   = clients.filter((c) => c.status === "lost");

  const interestByStatus = {
    // Entry averages — clients.interest_scale (immutable entry value)
    entry: {
      active: avgValues(activeClients.map(getEntryInterest)),
      won:    avgValues(wonClients.map(getEntryInterest)),
      lost:   avgValues(lostClients.map(getEntryInterest)),
    },
    // Close averages — interest on the closing event (won/lost only)
    close: {
      won:  avgValues(wonClients.map(c => closeInterestByClientId.get(c.id) ?? null)),
      lost: avgValues(lostClients.map(c => closeInterestByClientId.get(c.id) ?? null)),
    },
    // Legacy flat values kept for any other code that reads interestByStatus.active etc.
    active: avgValues(activeClients.map(getEntryInterest)),
    won:    avgValues(wonClients.map(getEntryInterest)),
    lost:   avgValues(lostClients.map(getEntryInterest)),
  };

  // Average interest per product (sorted descending)
  const productInterestMap: Record<string, number[]> = {};
  for (const c of clients) {
    const key = bucketProduct(c.product);
    const val = Number(c.interest_scale);
    if (!isNaN(val) && val > 0) {
      if (!productInterestMap[key]) productInterestMap[key] = [];
      productInterestMap[key].push(val);
    }
  }
  const interestByProduct = Object.entries(productInterestMap)
    .map(([product, vals]) => ({
      product,
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      count: vals.length,
    }))
    .sort((a, b) => b.avg - a.avg);

  // Interest vs conversion: bucket clients into Low (1–<4), Mid (4–<7), High (7–10)
  // ── Entry interest lookup ────────────────────────────────────────────────
  // Build a map of client_id → entry interest from the creation event
  // (from_stage IS NULL). Used by interestBuckets so the chart answers:
  // "what are the chances of winning a client who CAME IN with X interest?"
  // Falls back to clients.interest_scale for clients added before this column
  // was tracked on events (pre-migration).
  const entryInterestByClient = new Map<string, number>();
  for (const e of events) {
    if (e.from_stage == null && e.interest_scale != null && !isNaN(Number(e.interest_scale))) {
      // Take earliest creation event per client
      if (!entryInterestByClient.has(e.client_id)) {
        entryInterestByClient.set(e.client_id, Number(e.interest_scale));
      }
    }
  }

  // Interest vs conversion: bucket clients into Low (1–<4), Mid (4–<7), High (7–10)
  // Boundaries are EXCLUSIVE upper: v >= min && v < max, so interest=4 → Mid, interest=7 → High.
  // Uses ENTRY interest (interest when client was first added) so the question is:
  // "what % of clients who entered with Low/Mid/High interest were ultimately won?"
  const interestBuckets = [
    { label: "Low (1–3)",   min: 1, max: 4 },
    { label: "Mid (4–6)",   min: 4, max: 7 },
    { label: "High (7–10)", min: 7, max: 10.1 },
  ].map(({ label, min, max }) => {
    const group = clients.filter((c) => {
      // Prefer entry interest from creation event; fall back to current value
      const v = entryInterestByClient.has(c.id)
        ? entryInterestByClient.get(c.id)!
        : Number(c.interest_scale);
      return !isNaN(v) && v >= min && v < max;
    });
    const groupWon = group.filter((c) => c.status === "won").length;
    return {
      label,
      total: group.length,
      won: groupWon,
      rate: group.length ? Math.round((groupWon / group.length) * 100) : 0,
    };
  });

  // ── Interest Trend (grouped line: Entry → Mid → Close) ──────────────────
  // 3 fixed points for every decided client regardless of how many stages:
  //
  //   Entry = first recorded interest (creation event)
  //   Mid   = average of all intermediate events (everything except first & last)
  //           null if client went straight from entry to close with no events in between
  //   Close = last recorded interest (won / lost closing event)
  //
  // Every client contributes to Entry and Close — consistent sample size.
  // Mid only fills in when intermediate events exist.
  // The x-axis is simply: Entry | Mid | Close

  const wonPoints:  { entry: number; mid: number | null; close: number }[] = [];
  const lostPoints: { entry: number; mid: number | null; close: number }[] = [];

  for (const c of clients.filter((cl) => cl.status === "won" || cl.status === "lost")) {
    // All events for this client sorted chronologically
    const allClientEvts = events
      .filter((e) => e.client_id === c.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (allClientEvts.length === 0) continue;

    // ENTRY: first event that has a valid interest_scale, excluding closing events
    // (won/lost events are the exit point, never the entry)
    const entryEvent = allClientEvts.find(
      (e) =>
        e.event_type !== "won" &&
        e.event_type !== "lost" &&
        e.interest_scale != null &&
        !isNaN(Number(e.interest_scale))
    );

    // If no non-closing event has interest, fall back to clients.interest_scale
    // as the entry interest. clients.interest_scale is now immutable after creation —
    // stage saves no longer overwrite it — so this is always the entry value.
    const entryInterest =
      entryEvent != null
        ? Number(entryEvent.interest_scale)
        : (c.interest_scale != null && !isNaN(Number(c.interest_scale))
            ? Number(c.interest_scale)
            : null);

    // CLOSE: the won/lost event — use its interest_scale if set and valid.
    // 0 is a legitimate close interest (lost with zero engagement).
    // Fall back to clients.interest_scale only if the closing event has no data at all.
    const closingEvent = allClientEvts.findLast(
      (e) => e.event_type === "won" || e.event_type === "lost"
    );
    const closeInterest =
      closingEvent?.interest_scale != null && !isNaN(Number(closingEvent.interest_scale))
        ? Number(closingEvent.interest_scale)
        : (!isNaN(Number(c.interest_scale)) && Number(c.interest_scale) > 0
            ? Number(c.interest_scale)
            : null);

    if (entryInterest === null || closeInterest === null) continue;

    const entry = entryInterest;

    // MID: all events strictly between entry event and closing event that have valid interest_scale,
    // excluding the closing event itself
    const entryIdx   = entryEvent ? allClientEvts.indexOf(entryEvent) : 0;
    const closingIdx = closingEvent ? allClientEvts.indexOf(closingEvent) : allClientEvts.length;
    const midEvents  = allClientEvts
      .slice(entryIdx + 1, closingIdx)
      .filter(
        (e) =>
          e.event_type !== "won" &&
          e.event_type !== "lost" &&
          e.interest_scale != null &&
          !isNaN(Number(e.interest_scale))
      );
    const mid = midEvents.length > 0
      ? midEvents.reduce((sum, e) => sum + Number(e.interest_scale), 0) / midEvents.length
      : null;

    (c.status === "won" ? wonPoints : lostPoints).push({ entry, mid, close: closeInterest });
  }

  const avgNum = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const avgOrNull = (vals: (number | null)[]) => {
    const nums = vals.filter((v): v is number => v !== null);
    return avgNum(nums);
  };

  // Chart data — 3 points
  const interestTrendLine = [
    {
      label: "Entry",
      won:  wonPoints.length  > 0 ? parseFloat(avgNum(wonPoints.map(p => p.entry))!.toFixed(2))  : null,
      lost: lostPoints.length > 0 ? parseFloat(avgNum(lostPoints.map(p => p.entry))!.toFixed(2)) : null,
      wonN:  wonPoints.length,
      lostN: lostPoints.length,
    },
    {
      label: "Mid",
      won:  wonPoints.some(p => p.mid !== null)  ? parseFloat(avgOrNull(wonPoints.map(p => p.mid))!.toFixed(2))  : null,
      lost: lostPoints.some(p => p.mid !== null) ? parseFloat(avgOrNull(lostPoints.map(p => p.mid))!.toFixed(2)) : null,
      wonN:  wonPoints.filter(p => p.mid !== null).length,
      lostN: lostPoints.filter(p => p.mid !== null).length,
    },
    {
      label: "Close",
      won:  wonPoints.length  > 0 ? parseFloat(avgNum(wonPoints.map(p => p.close))!.toFixed(2))  : null,
      lost: lostPoints.length > 0 ? parseFloat(avgNum(lostPoints.map(p => p.close))!.toFixed(2)) : null,
      wonN:  wonPoints.length,
      lostN: lostPoints.length,
    },
  ];

  // Summary deltas
  const wonEntryAvg  = wonPoints.length  > 0 ? avgNum(wonPoints.map(p => p.entry))  : null;
  const wonExitAvg   = wonPoints.length  > 0 ? avgNum(wonPoints.map(p => p.close))  : null;
  const lostEntryAvg = lostPoints.length > 0 ? avgNum(lostPoints.map(p => p.entry)) : null;
  const lostExitAvg  = lostPoints.length > 0 ? avgNum(lostPoints.map(p => p.close)) : null;

  const interestTrend = {
    won: {
      count: wonPoints.length,
      avgEntry: wonEntryAvg  != null ? parseFloat(wonEntryAvg.toFixed(1))  : null,
      avgExit:  wonExitAvg   != null ? parseFloat(wonExitAvg.toFixed(1))   : null,
      avgDelta: wonEntryAvg  != null && wonExitAvg  != null ? parseFloat((wonExitAvg  - wonEntryAvg).toFixed(1))  : null,
    },
    lost: {
      count: lostPoints.length,
      avgEntry: lostEntryAvg != null ? parseFloat(lostEntryAvg.toFixed(1)) : null,
      avgExit:  lostExitAvg  != null ? parseFloat(lostExitAvg.toFixed(1))  : null,
      avgDelta: lostEntryAvg != null && lostExitAvg != null ? parseFloat((lostExitAvg - lostEntryAvg).toFixed(1)) : null,
    },
    lineData: interestTrendLine,
    chartData: [] as { outcome: string; entry: number | null; exit: number | null; n: number }[],
    rows: [] as { clientId: string; status: string; firstInterest: number; lastInterest: number; delta: number }[],
  };

  // ── Most recent interest per client from stage events ────────────────────
  // Use the latest interest_scale recorded in client_stage_events as the
  // "current" interest. This is more accurate than clients.interest_scale which
  // is only set at creation time.
  const latestEventInterestByClient = new Map<string, number>();
  const latestEventTs = new Map<string, number>();
  for (const e of events) {
    if (e.interest_scale != null && !isNaN(Number(e.interest_scale))) {
      const ts = new Date(e.created_at).getTime();
      const prev = latestEventTs.get(e.client_id) ?? -1;
      if (ts > prev) {
        latestEventTs.set(e.client_id, ts);
        latestEventInterestByClient.set(e.client_id, Number(e.interest_scale));
      }
    }
  }

  // Helper: get current interest for a client (latest event value, falls back to clients.interest_scale)
  function getCurrentInterest(c: ClientRow): number | null {
    if (latestEventInterestByClient.has(c.id)) return latestEventInterestByClient.get(c.id)!;
    const v = Number(c.interest_scale);
    return !isNaN(v) && v > 0 ? v : null;
  }

  // client_ids that have at least one active follow-up (used for hotLeads + hotLeadsWithFollowUp)
  const clientIdsWithActiveFollowUp = new Set(followUps.map((f) => f.client_id));

  // hotLeadsAll: active, interest >= 7 — NO time filter
  // Used for the Hot Lead Coverage card list (shows all high-interest active clients)
  const hotLeadsAll = clients
    .filter((c) => {
      if (c.status !== "active") return false;
      const v = getCurrentInterest(c);
      return v !== null && v >= 7;
    })
    .map((c) => {
      const last = lastEventByClient.get(c.id) ?? new Date(c.created_at).getTime();
      return {
        ...c,
        daysSinceActivity: Math.floor((nowMs - last) / (1000 * 60 * 60 * 24)),
        currentInterest: getCurrentInterest(c) ?? Number(c.interest_scale),
        hasFollowUp: clientIdsWithActiveFollowUp.has(c.id),
      };
    })
    .sort((a, b) => b.currentInterest - a.currentInterest);

  // hotLeads: active, interest >= 7, AND no activity in 14+ days — urgent follow-up needed
  // Used for the bottom Hot Leads list card
  const hotLeads = hotLeadsAll
    .filter((c) => c.daysSinceActivity > 14);

  // ── 1. Lead-to-Opportunity Rate ───────────────────────────────────────────
  // Clients who ever reached Stage 2+ (= qualifiedOpportunities) ÷ total clients
  const leadToOpportunityRate = total > 0 ? qualifiedOpportunities / total : 0;

  // ── 2. Stale Deal Rate ────────────────────────────────────────────────────
  // Stale active clients ÷ total active clients (0–1 ratio)
  const staleDealRate = active > 0 ? staleClients.length / active : 0;

  // ── 3. Win Rate by Channel ────────────────────────────────────────────────
  // For each channel: total from byMode, won count from wonByMode, rate = won/total
  const wonByMode: Record<string, number> = {};
  for (const c of clients.filter((c) => c.status === "won")) {
    wonByMode[c.mode_of_connection] = (wonByMode[c.mode_of_connection] ?? 0) + 1;
  }
  const winRateByChannel = Object.entries(byMode)
    .map(([channel, total_]) => {
      const channelWon = wonByMode[channel] ?? 0;
      return {
        channel,
        total: total_,
        won: channelWon,
        rate: total_ > 0 ? channelWon / total_ : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ── 4. Interest-Weighted Pipeline Score ──────────────────────────────────
  // For each active client: current_interest × stage_weight (1→1, 2→2, 3→3)
  // "current_interest" = most recent interest_scale from client_stage_events,
  // falling back to clients.interest_scale if no events recorded it yet.
  // Average across active clients with a valid interest value > 0.
  const stageWeights: Record<number, number> = { 1: 1, 2: 2, 3: 3 };
  const activeClientsWithInterest = clients.filter((c) => {
    if (c.status !== "active") return false;
    const v = getCurrentInterest(c);
    return v !== null && v > 0;
  });
  const interestWeightedScore = activeClientsWithInterest.length > 0
    ? activeClientsWithInterest.reduce((sum, c) => {
        const interest = getCurrentInterest(c) ?? 0;
        const weight = stageWeights[c.current_stage] ?? 1;
        return sum + interest * weight;
      }, 0) / activeClientsWithInterest.length
    : null;

  // ── 5. Hot Lead Utilisation Rate ──────────────────────────────────────────
  // Hot leads = all active clients whose most recent interest_scale >= 7
  const hotLeadsTotal = clients.filter((c) => {
    if (c.status !== "active") return false;
    const v = getCurrentInterest(c);
    return v !== null && v >= 7;
  }).length;
  const hotLeadsWithFollowUp = clients.filter((c) => {
    if (c.status !== "active") return false;
    const v = getCurrentInterest(c);
    return v !== null && v >= 7 && clientIdsWithActiveFollowUp.has(c.id);
  }).length;
  const hotLeadUtilisationRate = hotLeadsTotal > 0 ? hotLeadsWithFollowUp / hotLeadsTotal : null;

  // ── Deal Stage Conversion Rate ────────────────────────────────────────────
  // Two separate, self-consistent metric sets:
  //
  // A) Stage-to-next-stage progression rates (funnel drop-off)
  //    "Of clients that entered Stage N, what % advanced to Stage N+1 (or Won)?"
  //    Denominator = clients with confirmed evidence of being at Stage N
  //    Numerator   = clients that have a 'progress' event from that stage
  //                  (or status=won for the final stage, since "won" IS the exit from Stage 3)
  //
  // B) Cumulative win rates by entry stage
  //    "Of clients that ever reached Stage N, what % were ultimately won?"
  //    Denominator = clients with confirmed evidence of being at Stage N
  //    Numerator   = subset of those that are now status=won
  //
  // Both use the SAME denominators; only the numerator definition differs.
  // We do NOT infer stage history from status — only from actual stage events
  // and current_stage. This prevents the inflation where every won/lost client
  // gets counted as having passed through every stage.

  // Build confirmed stage membership from explicit evidence only:
  //   - current_stage value (client is here now)
  //   - from_stage / to_stage on progress/regress events (client was here)
  const confirmedAtStage = new Map<number, Set<string>>();
  for (const s of [1, 2, 3]) confirmedAtStage.set(s, new Set());

  for (const c of clients) {
    // Only add to confirmed stage based on where the client actually IS now.
    // Do NOT assume every client started at Stage 1 — they may have been
    // added directly at Stage 2 or 3.
    if (c.current_stage >= 1 && c.current_stage <= 3)
      confirmedAtStage.get(c.current_stage)!.add(c.id);
  }
  for (const e of events) {
    if (e.event_type === "progress" || e.event_type === "regress") {
      if (e.from_stage != null && e.from_stage >= 1 && e.from_stage <= 3)
        confirmedAtStage.get(e.from_stage)!.add(e.client_id);
      if (e.to_stage != null && e.to_stage >= 1 && e.to_stage <= 3)
        confirmedAtStage.get(e.to_stage)!.add(e.client_id);
    }
  }

  // Clients that made a specific stage-to-stage progress transition (deduped)
  const progressedFrom = new Map<number, Set<string>>();
  for (const s of [1, 2, 3]) progressedFrom.set(s, new Set());
  for (const e of events.filter((e) => e.event_type === "progress")) {
    if (e.from_stage != null && e.from_stage >= 1 && e.from_stage <= 3)
      progressedFrom.get(e.from_stage)!.add(e.client_id);
  }

  // Clients that won (deduped)
  const clientsWon = new Set(events.filter((e) => e.event_type === "won").map((e) => e.client_id));
  for (const c of clients.filter((c) => c.status === "won")) clientsWon.add(c.id);

  // ── A: Stage-to-next-stage progression (true funnel drop-off) ──────────
  // Stage 3 → Won uses clientsWon because winning IS the exit from Stage 3
  const stageProgressionRates = [1, 2, 3].map((stage) => {
    const denom = confirmedAtStage.get(stage)!.size;
    
    let num: number;
    if (stage < 3) {
      // For Stage 1→2 and 2→3, count progress events
      // If filterUserId is set, only count progressions by that user
      if (filterUserId) {
        num = events.filter((e) => 
          e.event_type === "progress" && 
          e.from_stage === stage && 
          e.user_id === filterUserId
        ).length;
      } else {
        num = progressedFrom.get(stage)!.size;
      }
    } else {
      // For Stage 3→Won, count won events
      // If filterUserId is set, only count wins by that user
      if (filterUserId) {
        num = events.filter((e) => 
          e.event_type === "won" && 
          e.user_id === filterUserId &&
          confirmedAtStage.get(3)!.has(e.client_id)
        ).length;
      } else {
        num = [...confirmedAtStage.get(3)!].filter((id) => clientsWon.has(id)).length;
      }
    }
    
    const nextLabel = stage < 3 ? `Stage ${stage + 1}` : "Won";
    return {
      label: `Stage ${stage} → ${nextLabel}`,
      stage,
      numerator: num,
      denominator: denom,
      rate: denom > 0 ? num / denom : 0,
    };
  });

  // ── B: Cumulative win rate by entry stage ───────────────────────────────
  // "Of everyone who ever reached Stage N, what % were ultimately won?"
  const stageCumulativeWinRates = [1, 2, 3].map((stage) => {
    const atStage = confirmedAtStage.get(stage)!;
    const denom = atStage.size;
    const num = [...atStage].filter((id) => clientsWon.has(id)).length;
    return {
      label: `Stage ${stage} → Won`,
      stage,
      numerator: num,
      denominator: denom,
      rate: denom > 0 ? num / denom : 0,
    };
  });

  // Expose both sets; the chart will let the user toggle between them
  const stageConversionRates = { progression: stageProgressionRates, cumulative: stageCumulativeWinRates };

  // ── Activity Metrics ──────────────────────────────────────────────────────
  // Merges two sources with source tagging:
  //   "stage"    — client_stage_events (stage updates, new client creation)
  //   "followup" — follow_up_logs (follow-up check-ins)

  const activityEvents = events.filter((e) => e.activity_type != null && e.activity_type !== "");
  const activityLogs = followUpLogs.filter((l) => l.activity_type != null && l.activity_type !== "");

  type ActivityEntry = { userId: string; type: string; ts: number; source: "stage" | "followup" };
  const allActivities: ActivityEntry[] = [
    ...activityEvents.map((e) => ({ userId: e.user_id, type: e.activity_type!, ts: new Date(e.created_at).getTime(), source: "stage" as const })),
    ...activityLogs.map((l) => ({ userId: l.user_id, type: l.activity_type!, ts: new Date(l.logged_at).getTime(), source: "followup" as const })),
  ];

  // Combined + source-split by activity type
  const byActivityType: Record<string, number> = {};
  const byActivityTypeStage: Record<string, number> = {};
  const byActivityTypeFollowUp: Record<string, number> = {};
  for (const a of allActivities) {
    byActivityType[a.type] = (byActivityType[a.type] ?? 0) + 1;
    if (a.source === "stage") {
      byActivityTypeStage[a.type] = (byActivityTypeStage[a.type] ?? 0) + 1;
    } else {
      byActivityTypeFollowUp[a.type] = (byActivityTypeFollowUp[a.type] ?? 0) + 1;
    }
  }

  // Per-rep breakdown with source split
  const repActivityMap = new Map<string, { stage: Record<string, number>; followup: Record<string, number> }>();
  for (const a of allActivities) {
    if (!repActivityMap.has(a.userId)) repActivityMap.set(a.userId, { stage: {}, followup: {} });
    const rep = repActivityMap.get(a.userId)!;
    rep[a.source][a.type] = (rep[a.source][a.type] ?? 0) + 1;
  }
  const byRepActivity = [...repActivityMap.entries()]
    .filter(([userId]) => !filterUserId || userId === filterUserId)
    .map(([userId, { stage, followup }]) => {
      const breakdown = { ...stage };
      for (const [k, v] of Object.entries(followup)) breakdown[k] = (breakdown[k] ?? 0) + v;
      return {
        userId,
        name: profileById.get(userId)?.name ?? "Unknown",
        total: Object.values(breakdown).reduce((a, b) => a + b, 0),
        totalStage: Object.values(stage).reduce((a, b) => a + b, 0),
        totalFollowUp: Object.values(followup).reduce((a, b) => a + b, 0),
        breakdown,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Daily trend — last 14 days with source split for stacked chart
  const activityTrend: { label: string; count: number; stage: number; followup: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
    activityTrend.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0, stage: 0, followup: 0 });
  }
  for (const a of allActivities) {
    const daysAgo = Math.floor((nowMs - a.ts) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo <= 13) {
      activityTrend[13 - daysAgo].count++;
      activityTrend[13 - daysAgo][a.source]++;
    }
  }

  // ── Follow-up Coverage ────────────────────────────────────────────────────
  // For every non-won client: has active follow-up? last follow-up log date?
  const activeFollowUpClientIds = new Set(followUps.map((f) => f.client_id));
  const lastFollowUpLogByClient = new Map<string, number>();
  for (const l of followUpLogs) {
    const t = new Date(l.logged_at).getTime();
    if (t > (lastFollowUpLogByClient.get(l.client_id) ?? 0))
      lastFollowUpLogByClient.set(l.client_id, t);
  }
  const nonWonClients = clients.filter((c) => c.status !== "won");
  const followUpCoverage = {
    total: nonWonClients.length,
    withActiveFollowUp: nonWonClients.filter((c) => activeFollowUpClientIds.has(c.id)).length,
    withRecentLog: nonWonClients.filter((c) => {
      const last = lastFollowUpLogByClient.get(c.id);
      return last != null && nowMs - last <= STALE_DAYS;
    }).length,
    // neverFollowedUp: no active follow-up scheduled AND no follow-up log ever created.
    // A client with a scheduled follow-up but zero check-in logs is NOT counted here.
    neverFollowedUp: nonWonClients.filter(
      (c) => !activeFollowUpClientIds.has(c.id) && !lastFollowUpLogByClient.has(c.id)
    ).length,
    coverageRate: nonWonClients.length > 0
      ? nonWonClients.filter((c) => activeFollowUpClientIds.has(c.id)).length / nonWonClients.length
      : null,
    byStage: [1, 2, 3].map((stage) => {
      const sc = nonWonClients.filter((c) => c.current_stage === stage && c.status === "active");
      return {
        stage,
        total: sc.length,
        withFollowUp: sc.filter((c) => activeFollowUpClientIds.has(c.id)).length,
        rate: sc.length > 0 ? sc.filter((c) => activeFollowUpClientIds.has(c.id)).length / sc.length : null,
      };
    }),
  };

  const totalActivities = allActivities.length;
  const totalStageActivities = activityEvents.length;
  const totalFollowUpActivities = activityLogs.length;

  return {
    total,
    active,
    won,
    lost,
    stage3,
    conversion,
    winRate,
    closeRate,
    otcRate,
    qualifiedOpportunities,
    salesVelocity,
    avgCycleDays,
    medianCycleDays,
    minCycleDays,
    maxCycleDays,
    cycleByRep,
    funnel,
    byMode,
    byCategory,
    wonByCategory,
    topUsers,
    topSourcers,
    timeseries: buckets.map((b) => ({ label: b.label, count: b.count })),
    staleClients,
    stale: staleClients.length,
    bestCategory,
    byProduct,
    wonByProduct,
    enquiredByProduct,
    // Interest scale
    interestByStatus,
    interestByProduct,
    interestBuckets,
    interestTrend,
    hotLeads,
    hotLeadsAll,
    // New computed fields
    leadToOpportunityRate,
    staleDealRate,
    winRateByChannel,
    interestWeightedScore,
    hotLeadsTotal,
    hotLeadsWithFollowUp,
    hotLeadUtilisationRate,
    // Deal stage conversion rates
    stageConversionRates,
    // Activity metrics
    activityMetrics: {
      total: totalActivities,
      totalStage: totalStageActivities,
      totalFollowUp: totalFollowUpActivities,
      byType: byActivityType,
      byTypeStage: byActivityTypeStage,
      byTypeFollowUp: byActivityTypeFollowUp,
      byRep: byRepActivity,
      trend: activityTrend,
    },
    // Follow-up coverage across non-won clients
    followUpCoverage,
  };
}

export type AnalyticsResult = ReturnType<typeof computeAnalytics>;

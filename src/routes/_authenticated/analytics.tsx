import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { computeAnalytics } from "@/lib/analytics-compute";
import type { ClientRow, StageEventRow, ProfileRow } from "@/lib/analytics-compute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { Link } from "@tanstack/react-router";
import { useDataScope } from "@/contexts/data-scope-context";
import { DataScopeToggle } from "@/components/data-scope-toggle";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { TrendingUp, Trophy, AlertTriangle, MessageSquareText, Calendar, ChevronDown, Clock, BarChart3, Star, Flame, Users, Bell, XCircle, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

// ── Design tokens (kept in one place so the whole page stays coherent) ──────
const C = {
  red:         "oklch(0.62 0.23 25)",
  redBright:   "oklch(0.70 0.24 25)",
  redMuted:    "oklch(0.45 0.15 25)",
  amber:       "oklch(0.76 0.17 65)",
  green:       "oklch(0.65 0.19 145)",
  blue:        "oklch(0.65 0.18 240)",
  purple:      "oklch(0.65 0.18 300)",
  teal:        "oklch(0.68 0.16 185)",
  grid:        "oklch(0.28 0.01 260)",
  axis:        "oklch(0.60 0.01 260)",
  bg:          "oklch(0.20 0.012 260)",
  tooltipBg:   "oklch(0.18 0.012 260)",
  tooltipBorder:"oklch(0.30 0.02 260)",
  white:       "oklch(0.95 0 0)",
};

// A palette for ranked bar charts — cycles through distinct hues so bars
// each get their own colour rather than a single solid red.
const RANKED_PALETTE = [
  C.red, C.amber, C.teal, C.blue, C.purple, C.green, C.redBright, C.redMuted,
];

// Human-readable labels for activity_type values (mirrors ACTIVITY_TYPES in clients pages)
const ACTIVITY_LABEL: Record<string, string> = {
  call:           "📞 Phone Call",
  whatsapp:       "💬 WhatsApp",
  sms:            "📱 SMS",
  email:          "✉️ Email",
  linkedin_dm:    "💼 LinkedIn",
  ig_dm:          "📸 Instagram DM",
  facebook_dm:    "👥 Facebook DM",
  twitter_dm:     "🐦 X / Twitter DM",
  telegram:       "✈️ Telegram",
  meeting:        "🤝 Physical Meeting",
  video_call:     "🎥 Video Call",
  conference:     "🎪 Conference / Event",
  demo:           "🖥️ Demo / Walkthrough",
  referral_intro: "🔗 Referral Intro",
  website_form:   "🌐 Website Form",
};

const timeseriesChartConfig: ChartConfig = {
  count: { label: "Clients", color: C.red },
} satisfies ChartConfig;

const STAGE_STYLES = [
  { bg: "bg-stage-1/10", border: "border-stage-1/30", text: "text-stage-1" },
  { bg: "bg-stage-2/10", border: "border-stage-2/30", text: "text-stage-2" },
  { bg: "bg-stage-3/10", border: "border-stage-3/30", text: "text-stage-3" },
];

type TimePeriod = "all" | "this-year" | "last-year" | "q1" | "q2" | "q3" | "q4" | "this-month" | "last-month";

const TIME_PERIODS: { value: TimePeriod; label: string; group?: string }[] = [
  { value: "all",        label: "All Time" },
  { value: "this-year",  label: "This Year" },
  { value: "last-year",  label: "Last Year" },
  { value: "q1",         label: "Q1 (Jan–Mar)" },
  { value: "q2",         label: "Q2 (Apr–Jun)" },
  { value: "q3",         label: "Q3 (Jul–Sep)" },
  { value: "q4",         label: "Q4 (Oct–Dec)" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
];

function filterByPeriod<T extends { created_at: string }>(items: T[], period: TimePeriod): T[] {
  if (period === "all") return items;
  const now = new Date();
  let start: Date;
  let end: Date;
  switch (period) {
    case "this-year":
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case "last-year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear(), 0, 1);
      break;
    case "this-month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case "last-month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "q1":
      start = new Date(now.getFullYear(), 0, 1);
      end   = new Date(now.getFullYear(), 3, 1);
      break;
    case "q2":
      start = new Date(now.getFullYear(), 3, 1);
      end   = new Date(now.getFullYear(), 6, 1);
      break;
    case "q3":
      start = new Date(now.getFullYear(), 6, 1);
      end   = new Date(now.getFullYear(), 9, 1);
      break;
    case "q4":
      start = new Date(now.getFullYear(), 9, 1);
      end   = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default:
      return items;
  }
  const startTime = start.getTime();
  const endTime = end.getTime();
  return items.filter((item) => {
    const t = new Date(item.created_at).getTime();
    return t >= startTime && t < endTime;
  });
}

// Returns [startMs, endMs] for a period, or null for "all".
// Used to filter follow_up_logs (which use logged_at, not created_at)
// and to pass the correct anchorMs to computeAnalytics.
function getPeriodBounds(period: TimePeriod): [number, number] | null {
  if (period === "all") return null;
  const now = new Date();
  let start: Date;
  let end: Date;
  switch (period) {
    case "this-year":
      start = new Date(now.getFullYear(), 0, 1);
      end   = new Date(now.getFullYear() + 1, 0, 1);
      break;
    case "last-year":
      start = new Date(now.getFullYear() - 1, 0, 1);
      end   = new Date(now.getFullYear(), 0, 1);
      break;
    case "this-month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      break;
    case "last-month":
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end   = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "q1":
      start = new Date(now.getFullYear(), 0, 1);
      end   = new Date(now.getFullYear(), 3, 1);
      break;
    case "q2":
      start = new Date(now.getFullYear(), 3, 1);
      end   = new Date(now.getFullYear(), 6, 1);
      break;
    case "q3":
      start = new Date(now.getFullYear(), 6, 1);
      end   = new Date(now.getFullYear(), 9, 1);
      break;
    case "q4":
      start = new Date(now.getFullYear(), 9, 1);
      end   = new Date(now.getFullYear() + 1, 0, 1);
      break;
    default:
      return null;
  }
  return [start.getTime(), end.getTime()];
}

function getTimeSeriesBuckets(clients: ClientRow[], period: TimePeriod): { label: string; count: number }[] {
  const now = new Date();
  if (period === "this-month" || period === "last-month") {
    // Daily buckets for monthly view
    const monthStart = period === "this-month"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = period === "this-month"
      ? new Date(now.getFullYear(), now.getMonth() + 1, 0)
      : new Date(now.getFullYear(), now.getMonth(), 0);
    const daysInMonth = monthEnd.getDate();
    const buckets: { label: string; count: number; date: Date }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), d);
      buckets.push({ label: `${d}`, count: 0, date });
    }
    for (const c of clients) {
      const t = new Date(c.created_at);
      if (t.getMonth() === monthStart.getMonth() && t.getFullYear() === monthStart.getFullYear()) {
        const day = t.getDate() - 1;
        if (day >= 0 && day < buckets.length) buckets[day].count++;
      }
    }
    return buckets.map((b) => ({ label: b.label, count: b.count }));
  }
  if (period === "q1" || period === "q2" || period === "q3" || period === "q4") {
    // Weekly buckets for named quarters (current year)
    let actualStart: Date;
    let actualEnd: Date;
    if (period === "q1") {
      actualStart = new Date(now.getFullYear(), 0, 1);
      actualEnd   = new Date(now.getFullYear(), 3, 1);
    } else if (period === "q2") {
      actualStart = new Date(now.getFullYear(), 3, 1);
      actualEnd   = new Date(now.getFullYear(), 6, 1);
    } else if (period === "q3") {
      actualStart = new Date(now.getFullYear(), 6, 1);
      actualEnd   = new Date(now.getFullYear(), 9, 1);
    } else {
      actualStart = new Date(now.getFullYear(), 9, 1);
      actualEnd   = new Date(now.getFullYear() + 1, 0, 1);
    }
    const buckets: { label: string; count: number; startMs: number; endMs: number }[] = [];
    let cursor = new Date(actualStart);
    let week = 1;
    while (cursor < actualEnd) {
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 7);
      buckets.push({
        label: `W${week}`,
        count: 0,
        startMs: cursor.getTime(),
        endMs: Math.min(weekEnd.getTime(), actualEnd.getTime()),
      });
      cursor = weekEnd;
      week++;
    }
    for (const c of clients) {
      const t = new Date(c.created_at).getTime();
      for (const b of buckets) {
        if (t >= b.startMs && t < b.endMs) { b.count++; break; }
      }
    }
    return buckets.map((b) => ({ label: b.label, count: b.count }));
  }
  if (period === "this-year" || period === "last-year") {
    // Monthly buckets for yearly view
    const year = period === "this-year" ? now.getFullYear() : now.getFullYear() - 1;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const buckets: { label: string; count: number; month: number }[] = monthNames.map((name, i) => ({
      label: name, count: 0, month: i,
    }));
    for (const c of clients) {
      const d = new Date(c.created_at);
      if (d.getFullYear() === year) buckets[d.getMonth()].count++;
    }
    return buckets.map((b) => ({ label: b.label, count: b.count }));
  }
  // All time: 8 weekly buckets (default)
  const buckets: { label: string; count: number; date: Date }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: 0, date: d });
  }
  for (const c of clients) {
    const t = new Date(c.created_at).getTime();
    for (let i = 0; i < buckets.length; i++) {
      const start = buckets[i].date.getTime();
      const end = i < buckets.length - 1 ? buckets[i + 1].date.getTime() : start + 7 * 24 * 60 * 60 * 1000;
      if (t >= start && t < end) { buckets[i].count++; break; }
    }
  }
  return buckets.map((b) => ({ label: b.label, count: b.count }));
}

function TimeFilter({ value, onChange }: { value: TimePeriod; onChange: (p: TimePeriod) => void }) {
  const [open, setOpen] = useState(false);
  const label = TIME_PERIODS.find((p) => p.value === value)?.label ?? "All Time";
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)} className="gap-2">
        <Calendar className="h-4 w-4" />
        {label}
        <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[160px]">
            {TIME_PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => { onChange(p.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer ${value === p.value ? "bg-accent font-medium" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AnalyticsPage() {
  const { effectiveUserId } = useDataScope();
  const { data: me } = useCurrentUser();
  const { data: rawData, isLoading } = useAnalyticsData(effectiveUserId, me?.company?.id);
  const { toggle } = useAIDrawer();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("all");

  // Filter data by time period and recompute analytics
  const data = useMemo(() => {
    if (!rawData?._raw) return rawData;
    // Short-circuit for "all" — no filtering needed, reuse what the hook already computed.
    if (timePeriod === "all") return rawData;

    const { clients, events, profiles, followUps, followUpLogs } = rawData._raw;
    const filteredClients = filterByPeriod(clients, timePeriod);
    const filteredEvents  = filterByPeriod(events, timePeriod);

    // followUps: keep only active follow-ups for clients in the filtered set
    const filteredClientIds = new Set(filteredClients.map((c) => c.id));
    const filteredFollowUps = followUps.filter((f) => filteredClientIds.has(f.client_id));

    // followUpLogs: filter by logged_at (not created_at) within the period window
    const bounds = getPeriodBounds(timePeriod);
    const filteredFollowUpLogs = bounds
      ? followUpLogs.filter((l) => {
          const t = new Date(l.logged_at).getTime();
          return t >= bounds[0] && t < bounds[1] && filteredClientIds.has(l.client_id);
        })
      : followUpLogs;

    // anchorMs: use the period end so that stale/trend windows are relative to
    // the end of the selected period, not today.
    const anchorMs = bounds ? Math.min(bounds[1], Date.now()) : Date.now();

    return computeAnalytics(
      filteredClients,
      filteredEvents,
      profiles,
      filteredFollowUps,
      filteredFollowUpLogs,
      anchorMs,
      effectiveUserId,
    );
  }, [rawData, timePeriod, effectiveUserId]);

  // All hooks must be called before any early return
  const timeSeriesData = useMemo(() => {
    if (!rawData?._raw || !data) return data?.timeseries ?? [];
    // For the "Clients Added" chart, only count clients the user actually CREATED
    // (not just associated with), since "added" means "sourced/created"
    const clientsToCount = effectiveUserId
      ? rawData._raw.clients.filter(c => c.created_by === effectiveUserId)
      : rawData._raw.clients;
    const filteredClients = filterByPeriod(clientsToCount, timePeriod);
    return getTimeSeriesBuckets(filteredClients, timePeriod);
  }, [rawData, timePeriod, data, effectiveUserId]);

  const timeSeriesTitle = useMemo(() => {
    switch (timePeriod) {
      case "this-year":    return "Clients Added (this year, monthly)";
      case "last-year":    return "Clients Added (last year, monthly)";
      case "this-month":   return "Clients Added (this month, daily)";
      case "last-month":   return "Clients Added (last month, daily)";
      case "q1": return `Clients Added (Q1 ${new Date().getFullYear()}, weekly)`;
      case "q2": return `Clients Added (Q2 ${new Date().getFullYear()}, weekly)`;
      case "q3": return `Clients Added (Q3 ${new Date().getFullYear()}, weekly)`;
      case "q4": return `Clients Added (Q4 ${new Date().getFullYear()}, weekly)`;
      default: return "Clients Added (last 8 weeks)";
    }
  }, [timePeriod]);

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading analytics…</div>;
  }

  const winR = (data.winRate * 100).toFixed(1);
  const closeR = (data.closeRate * 100).toFixed(1);
  const otc = (data.otcRate * 100).toFixed(1);

  // Sort descending so the chart reads "what's winning" at a glance, and
  // attach each row's share of the total so the bar chart can show counts
  // and percentages together without a separate pie.
  const modeTotal = Object.values(data.byMode).reduce((a: number, b: number) => a + b, 0) || 1;
  const modeData = Object.entries(data.byMode)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / modeTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  const catTotal = Object.values(data.byCategory).reduce((a: number, b: number) => a + b, 0) || 1;
  const catData = Object.entries(data.byCategory)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / catTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  // Use historically-accurate stage progression rates from stageConversionRates
  // (based on confirmed stage membership) rather than a snapshot ratio of active
  // clients, which can exceed 100% and ignores won/lost clients.
  const funnelWithDropoff = data.funnel.map((stage, i) => {
    const progressionRate = data.stageConversionRates.progression[i];
    const advanceRate = progressionRate && progressionRate.denominator > 0
      ? Math.round(progressionRate.rate * 100)
      : null;
    return { ...stage, advanceRate };
  });

  const productTotal = Object.values(data.byProduct).reduce((a: number, b: number) => a + b, 0) || 1;
  const productData = Object.entries(data.byProduct)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / productTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  // pct = won ÷ total enquiries for that product (win rate per product), not share of all clients
  const wonByProductData = Object.entries(data.wonByProduct)
    .map(([name, value]) => ({
      name,
      value: value as number,
      pct: Math.round(((value as number) / (data.byProduct[name] ?? productTotal)) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  // pct = active enquiries ÷ total enquiries for that product
  const enquiredByProductData = Object.entries(data.enquiredByProduct)
    .map(([name, value]) => ({
      name,
      value: value as number,
      pct: Math.round(((value as number) / (data.byProduct[name] ?? productTotal)) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Conversion Rate Analysis — close rate, pipeline health &amp; team performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataScopeToggle />
          <TimeFilter value={timePeriod} onChange={setTimePeriod} />
          <Button variant="outline" onClick={toggle}>
            <MessageSquareText className="h-4 w-4 mr-2" />Ask the AI
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Core Sales KPIs</h2>
          <span className="text-xs text-muted-foreground ml-1">— key performance indicators</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Kpi label="Close / Conversion Rate" value={`${closeR}%`} icon={<TrendingUp className="h-4 w-4" />} accent
            tooltip={`CRAS core metric. Won ÷ Total leads (${data.total}). Full-funnel conversion from first touch to win.`} />
          <Kpi label="Win Rate" value={`${winR}%`} icon={<TrendingUp className="h-4 w-4" />}
            tooltip={`Won ÷ (Won + Lost). ${data.won} won, ${data.lost} lost. Closing execution on decided deals only.`} />
          <Kpi label="OTC Rate" value={`${otc}%`} icon={<TrendingUp className="h-4 w-4" />}
            tooltip={`Won ÷ Qualified opps (Stage 2+). ${data.won} won / ${data.qualifiedOpportunities} qualified. Industry avg: 20–35%`} />
          <Kpi label="Sales Velocity"
            value={data.salesVelocity != null ? `${data.salesVelocity.toFixed(2)}/day` : "—"}
            icon={<TrendingUp className="h-4 w-4" />}
            tooltip={`Deals closed per day. Avg cycle: ${data.avgCycleDays != null ? data.avgCycleDays.toFixed(0) + "d" : "n/a"}`} />
          <Kpi label="Avg Sales Cycle"
            value={data.avgCycleDays != null ? `${data.avgCycleDays.toFixed(0)}d` : "—"}
            icon={<Clock className="h-4 w-4" />}
            tooltip={`Mean days from first contact to won. Median: ${data.medianCycleDays != null ? data.medianCycleDays.toFixed(0) + "d" : "n/a"} | Min: ${data.minCycleDays != null ? data.minCycleDays.toFixed(0) + "d" : "n/a"} | Max: ${data.maxCycleDays != null ? data.maxCycleDays.toFixed(0) + "d" : "n/a"}`} />
        </div>

        {/* ── Pipeline Status counts ─────────────────────────────── */}
        <div className="flex items-center gap-2 pt-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Pipeline Status</span>
          <span className="flex-1 border-t border-border" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-3 gap-3 max-w-sm">
          <Kpi label="Won" value={data.won} icon={<Trophy className="h-4 w-4" />} valueColor={C.green} />
          <Kpi label="Lost" value={data.lost} icon={<XCircle className="h-4 w-4" />} valueColor={C.red} />
          <Kpi label="Stale" value={data.stale} icon={<AlertTriangle className="h-4 w-4" />} valueColor={C.amber} />
        </div>
      </div>

      {/* ── KPI Charts ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">KPI Charts</h2>
          <span className="text-xs text-muted-foreground ml-1">— KPIs expressed as visualisations</span>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">

        {/* Deal Stage Conversion Rate */}
        <StageConversionCard data={data.stageConversionRates} />

        {/* Sales Cycle Length */}
        <SalesCycleLengthCard
          avgCycleDays={data.avgCycleDays}
          medianCycleDays={data.medianCycleDays}
          minCycleDays={data.minCycleDays}
          maxCycleDays={data.maxCycleDays}
          cycleByRep={data.cycleByRep}
        />

        {/* Lead-to-Opportunity Rate */}
        <LeadToOpportunityCard
          rate={data.leadToOpportunityRate}
          qualified={data.qualifiedOpportunities}
          total={data.total}
        />

        {/* Stale Deal Rate */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
              <span>Stale Deal Rate</span>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.amber }}>
              {(data.staleDealRate * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.stale} of {data.active} active deals gone cold (14+ days)
            </p>
          </CardContent>
        </Card>

        {/* Interest-Weighted Pipeline Score */}
        <PipelineQualityCard score={data.interestWeightedScore} />

        {/* Hot Lead Utilisation Rate */}
        <HotLeadCoverageCard
          rate={data.hotLeadUtilisationRate}
          total={data.hotLeadsTotal}
          withFollowUp={data.hotLeadsWithFollowUp}
          leads={data.hotLeadsAll}
        />

        {/* Win Rate by Channel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Win Rate by Channel</CardTitle>
            <CardDescription>Conversion rate per acquisition channel — which sources close best, not just bring volume</CardDescription>
          </CardHeader>
          <CardContent style={{ height: Math.max(200, data.winRateByChannel.length * 44 + 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.winRateByChannel.map(d => ({ ...d, ratePct: Math.round(d.rate * 100) }))}
                layout="vertical"
                margin={{ left: 8, right: 72, top: 4, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="chanWinGrad" x1="1" y1="0" x2="0" y2="0">
                    <stop offset="0%" stopColor={C.green} stopOpacity={1} />
                    <stop offset="100%" stopColor={C.green} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                <YAxis type="category" dataKey="channel" width={120} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(_: any, __: any, entry: any) => {
                    const p = entry.payload;
                    return [`${p.ratePct}% — ${p.won} won of ${p.total} total`, "Win Rate"];
                  }}
                />
                <Bar dataKey="ratePct" fill="url(#chanWinGrad)" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  <LabelList
                    dataKey="ratePct"
                    position="right"
                    formatter={(v: any) => `${v}%`}
                    style={{ fill: C.white, fontSize: 11 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        </div>{/* end KPI Charts grid */}

        {/* Activity Metrics sub-section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Activity Metrics</h2>
            <span className="text-xs text-muted-foreground ml-1">— outreach volume logged by the team</span>
            {data.activityMetrics.total > 0 && (
              <Badge variant="outline" className="ml-auto font-mono text-xs">{data.activityMetrics.total} total</Badge>
            )}
          </div>

          {data.activityMetrics.total === 0 ? (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-muted-foreground">No activity logged yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Activity data appears here once reps start logging how they reached out — via stage updates or follow-up check-ins.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid lg:grid-cols-3 gap-4">
              {/* By method */}
              <Card>
                <CardHeader>
                  <CardTitle>By Method</CardTitle>
                  <CardDescription>Total logged outreach per channel</CardDescription>
                </CardHeader>
                <CardContent style={{ height: Math.max(200, Object.keys(data.activityMetrics.byType).length * 36 + 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(data.activityMetrics.byType)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => ({ type, count }))}
                      layout="vertical"
                      margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                      <YAxis type="category" dataKey="type" width={120} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }}
                        tickFormatter={(v: string) => ACTIVITY_LABEL[v] ?? v} />
                      <Tooltip
                        contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                        formatter={(value: any) => [value, "activities"]}
                        labelFormatter={(v: any) => ACTIVITY_LABEL[v] ?? v}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={24}>
                        {Object.keys(data.activityMetrics.byType)
                          .sort((a, b) => data.activityMetrics.byType[b] - data.activityMetrics.byType[a])
                          .map((_, idx) => <Cell key={idx} fill={RANKED_PALETTE[idx % RANKED_PALETTE.length]} />)}
                        <LabelList dataKey="count" position="right" style={{ fill: C.white, fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* By rep */}
              <Card>
                <CardHeader>
                  <CardTitle>By Rep</CardTitle>
                  <CardDescription>Total logged activities per team member</CardDescription>
                </CardHeader>
                <CardContent style={{ height: Math.max(200, data.activityMetrics.byRep.length * 44 + 32) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.activityMetrics.byRep}
                      layout="vertical"
                      margin={{ left: 8, right: 40, top: 4, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient id="actRepGrad" x1="1" y1="0" x2="0" y2="0">
                          <stop offset="0%" stopColor={C.purple} stopOpacity={1} />
                          <stop offset="100%" stopColor={C.purple} stopOpacity={0.4} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                        formatter={(_: any, __: any, entry: any) => {
                          const top = Object.entries(entry.payload.breakdown as Record<string, number>)
                            .sort((a, b) => b[1] - a[1]).slice(0, 3)
                            .map(([t, n]) => `${ACTIVITY_LABEL[t] ?? t}: ${n}`).join(" · ");
                          return [`${entry.payload.total} total — ${top}`, "Activity"];
                        }}
                      />
                      <Bar dataKey="total" fill="url(#actRepGrad)" radius={[0, 6, 6, 0]} maxBarSize={28}>
                        <LabelList dataKey="total" position="right" style={{ fill: C.white, fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* 14-day daily trend — stacked by source */}
              <Card>
                <CardHeader>
                  <CardTitle>14-Day Trend</CardTitle>
                  <CardDescription>Daily outreach by source — stage updates vs follow-up check-ins</CardDescription>
                </CardHeader>
                <CardContent style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.activityMetrics.trend} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 10 }} interval={2} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={24} tick={{ fill: C.axis, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                        formatter={(value: any, name?: any) => [value, name === "stage" ? "Stage updates" : "Follow-up check-ins"]}
                      />
                      <Bar dataKey="stage" stackId="a" fill={C.blue} name="stage" radius={[0, 0, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="followup" stackId="a" fill={C.green} name="followup" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </div>{/* end Activity Metrics sub-section */}

        {/* Follow-up Coverage sub-section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-1 border-b border-border">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Follow-up Coverage</h2>
            <span className="text-xs text-muted-foreground ml-1">— how well the pipeline is being nurtured</span>
            {data.followUpCoverage.coverageRate != null && (
              <Badge variant="outline" className="ml-auto font-mono text-xs">
                {(data.followUpCoverage.coverageRate * 100).toFixed(0)}% covered
              </Badge>
            )}
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            {/* Coverage summary KPIs */}
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Coverage</CardTitle>
                <CardDescription>Active follow-up scheduled vs total non-won clients</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Non-won clients", value: data.followUpCoverage.total, color: "text-foreground" },
                  { label: "With active follow-up", value: data.followUpCoverage.withActiveFollowUp, color: "text-green-500" },
                  { label: "Followed up last 14d", value: data.followUpCoverage.withRecentLog, color: "text-blue-400" },
                  { label: "Never followed up", value: data.followUpCoverage.neverFollowedUp, color: "text-red-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
                  </div>
                ))}
                {data.followUpCoverage.total > 0 && (
                  <div className="pt-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Coverage</span>
                      <span>{data.followUpCoverage.coverageRate != null ? (data.followUpCoverage.coverageRate * 100).toFixed(1) + "%" : "—"}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.round((data.followUpCoverage.coverageRate ?? 0) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coverage by stage */}
            <Card>
              <CardHeader>
                <CardTitle>Coverage by Stage</CardTitle>
                <CardDescription>% of active clients per stage with a follow-up scheduled</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.followUpCoverage.byStage.map((s) => ({
                      stage: `Stage ${s.stage}`,
                      withFollowUp: s.withFollowUp,
                      without: s.total - s.withFollowUp,
                      total: s.total,
                      rate: s.rate,
                    }))}
                    layout="vertical"
                    margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                    <YAxis type="category" dataKey="stage" width={56} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(value: any, name?: any) => [value, name === "withFollowUp" ? "With follow-up" : "Without"]}
                    />
                    <Bar dataKey="withFollowUp" stackId="a" fill={C.green} name="withFollowUp" radius={[0, 0, 0, 0]} maxBarSize={22}>
                      <LabelList
                        content={(props: any) => {
                          const { x, y, width, height, value, index } = props;
                          const d = data.followUpCoverage.byStage[index];
                          if (!d || d.total === 0) return null;
                          const pct = Math.round((d.withFollowUp / d.total) * 100);
                          return <text x={Number(x) + Number(width) + (d.total - d.withFollowUp === 0 ? 4 : 0)} y={Number(y) + Number(height) / 2 + 4} fill={C.white} fontSize={11}>{pct}%</text>;
                        }}
                      />
                    </Bar>
                    <Bar dataKey="without" stackId="a" fill={C.red} name="without" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity source breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Source</CardTitle>
                <CardDescription>Where activities originated — stage updates vs follow-ups</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                {data.activityMetrics.total === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No activities yet</p>
                ) : (
                  <>
                    {[
                      { label: "Stage updates", value: data.activityMetrics.totalStage, color: "bg-blue-500", pct: data.activityMetrics.total > 0 ? data.activityMetrics.totalStage / data.activityMetrics.total : 0 },
                      { label: "Follow-up check-ins", value: data.activityMetrics.totalFollowUp, color: "bg-green-500", pct: data.activityMetrics.total > 0 ? data.activityMetrics.totalFollowUp / data.activityMetrics.total : 0 },
                    ].map(({ label, value, color, pct }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold tabular-nums">{value} <span className="text-xs text-muted-foreground font-normal">({(pct * 100).toFixed(0)}%)</span></span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      {data.activityMetrics.totalFollowUp === 0
                        ? "No follow-up check-ins logged yet — all activity from stage updates."
                        : data.activityMetrics.totalFollowUp > data.activityMetrics.totalStage
                        ? "Follow-up activity dominates — good pipeline nurturing discipline."
                        : "Stage updates lead — follow-up logging has room to grow."}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>{/* end Follow-up Coverage sub-section */}

      </div>{/* end KPI Charts section */}

      {/* ── Pipeline & Analysis ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pipeline &amp; Analysis</h2>
          <span className="text-xs text-muted-foreground ml-1">— funnel health, segmentation &amp; team performance</span>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">

        <Card>
          <CardHeader>
            <CardTitle>Stage Funnel</CardTitle>
            <CardDescription>Active clients per stage, with advance rate between stages</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel stages={funnelWithDropoff} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{timeSeriesTitle}</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ChartContainer config={timeseriesChartConfig} className="h-full w-full">
              <AreaChart data={timeSeriesData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="tsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.red} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={C.red} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fill: C.axis, fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={C.red}
                  strokeWidth={2.5}
                  fill="url(#tsGradient)"
                  dot={{ fill: C.red, stroke: C.bg, strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: C.red, stroke: C.bg, strokeWidth: 2 }}
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mode of Connection</CardTitle><CardDescription>Where leads come from, ranked</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={modeData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Categories</CardTitle><CardDescription>Service mix, ranked</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={catData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Products</CardTitle><CardDescription>All clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ProductBarChart data={productData} color={C.blue} gradientId="grad-products" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sold by Product</CardTitle><CardDescription>Won clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ProductBarChart data={wonByProductData} color={C.green} gradientId="grad-sold" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Enquired by Product</CardTitle><CardDescription>Active clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ProductBarChart data={enquiredByProductData} color={C.teal} gradientId="grad-enquired" />
          </CardContent>
        </Card>

        {/* Interest by product */}
        <Card>
          <CardHeader>
            <CardTitle>Interest by Product</CardTitle>
            <CardDescription>Average interest scale per product — which products attract the most engaged clients</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            {data.interestByProduct.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interest data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.interestByProduct} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 10]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                  <YAxis type="category" dataKey="product" width={108} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(value: any, _: any, entry: any) => [
                      `${(value as number).toFixed(1)} avg (${entry.payload.count} clients)`,
                      "Interest",
                    ]}
                  />
                  <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {data.interestByProduct.map((_, idx) => (
                      <Cell key={idx} fill={RANKED_PALETTE[idx % RANKED_PALETTE.length]} />
                    ))}
                    <LabelList dataKey="avg" position="right" formatter={(v: any) => (v as number).toFixed(1)} style={{ fill: C.white, fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Interest vs conversion */}
        <Card>
          <CardHeader>
            <CardTitle>Interest vs Conversion</CardTitle>
            <CardDescription>Win rate by entry interest bucket — of clients who came in at Low / Mid / High interest, what % were won?</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ChartContainer config={{ rate: { label: "Win Rate %", color: C.purple } }} className="h-full w-full">
              <BarChart data={data.interestBuckets} margin={{ left: 4, right: 36, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="convGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.purple} stopOpacity={1} />
                    <stop offset="100%" stopColor={C.purple} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} unit="%" tick={{ fill: C.axis, fontSize: 11 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(_value, _name, item) => (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span className="font-mono font-semibold">{item.payload.rate}% win rate</span>
                          <span className="text-muted-foreground">{item.payload.won} won / {item.payload.total} total</span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="rate" fill="url(#convGradient)" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  <LabelList dataKey="rate" position="top" formatter={(v: any) => `${v}%`} style={{ fill: C.white, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Average interest by status */}
        <Card>
          <CardHeader>
            <CardTitle>Avg Interest by Status</CardTitle>
            <CardDescription>
              Entry = interest when client was first added. Close = interest recorded when the deal was won or lost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-2 pb-4 px-6">
            {/* Entry row */}
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Entry interest</p>
              <div className="flex items-start justify-around">
                {(["active", "won", "lost"] as const).map((status) => {
                  const val = data.interestByStatus.entry[status];
                  const color = status === "won" ? C.green : status === "lost" ? C.red : C.amber;
                  return (
                    <div key={status} className="flex flex-col items-center gap-2">
                      <span className="text-4xl font-bold font-mono" style={{ color }}>
                        {val != null ? val.toFixed(1) : "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          status === "won" ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
                          status === "lost" ? "border-destructive/30 text-destructive bg-destructive/10" :
                          "border-stage-2/30 text-stage-2 bg-stage-2/10"
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/50" />

            {/* Close row — won and lost only, no active placeholder */}
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Close interest</p>
              <div className="flex items-start justify-around">
                {(["won", "lost"] as const).map((status) => {
                  const val = data.interestByStatus.close[status];
                  const color = status === "won" ? C.green : C.red;
                  return (
                    <div key={status} className="flex flex-col items-center gap-2">
                      <span className="text-4xl font-bold font-mono" style={{ color }}>
                        {val != null ? val.toFixed(1) : "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          status === "won" ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
                          "border-destructive/30 text-destructive bg-destructive/10"
                        }
                      >
                        {status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interest trend — grouped line chart across deal lifecycle */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Interest Trend: Deal Lifecycle</CardTitle>
            <CardDescription>
              Average interest at Entry, Mid (intermediate stages), and Close — grouped by outcome. Does interest rise for won deals and fall for lost ones?
              <br />
              <span className="text-xs">Δ = net change in interest from first recorded stage to close (close interest − entry interest)</span>
            </CardDescription>
          </CardHeader>
          <CardContent style={{ height: 300 }}>
            {data.interestTrend.won.count === 0 && data.interestTrend.lost.count === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <p className="text-sm text-muted-foreground">No interest trend data yet.</p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Data will appear once deals are closed with interest recorded on their stage updates.
                </p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height="90%">
                  <LineChart
                    data={data.interestTrend.lineData}
                    margin={{ left: 8, right: 24, top: 12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: C.axis, fontSize: 11 }}
                    />
                    <YAxis
                      domain={[0, 10]}
                      ticks={[0, 2, 4, 6, 8, 10]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: C.axis, fontSize: 11 }}
                      width={28}
                    />
                    <Tooltip
                      contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(value: any, name: string | number | undefined, item: any) => {
                        const isWon = name === "won";
                        const n = isWon ? item.payload.wonN : item.payload.lostN;
                        return [
                          `${(value as number).toFixed(1)} avg (${n} deals)`,
                          isWon ? "Won" : "Lost",
                        ];
                      }}
                    />
                    {/* Won line — green, solid */}
                    {data.interestTrend.won.count > 0 && (
                      <Line
                        type="monotone"
                        dataKey="won"
                        name="won"
                        stroke={C.green}
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: C.green, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    )}
                    {/* Lost line — red, dashed */}
                    {data.interestTrend.lost.count > 0 && (
                      <Line
                        type="monotone"
                        dataKey="lost"
                        name="lost"
                        stroke={C.red}
                        strokeWidth={2.5}
                        strokeDasharray="5 3"
                        dot={{ r: 4, fill: C.red, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                  {data.interestTrend.won.count > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-6 h-0.5" style={{ background: C.green }} />
                      Won ({data.interestTrend.won.count} deals)
                    </span>
                  )}
                  {data.interestTrend.lost.count > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: C.red }} />
                      Lost ({data.interestTrend.lost.count} deals)
                    </span>
                  )}
                </div>

                {/* Delta summary — entry → close with net change explained */}
                <div className="flex items-center justify-center gap-8 mt-1 text-xs text-muted-foreground">
                  {data.interestTrend.won.avgEntry != null && data.interestTrend.won.avgExit != null && (
                    <span>
                      Won: entry{" "}
                      <span className="font-mono text-white">{data.interestTrend.won.avgEntry.toFixed(1)}</span>
                      {" → "}close{" "}
                      <span className="font-mono text-white">{data.interestTrend.won.avgExit.toFixed(1)}</span>
                      {" "}
                      <span style={{ color: (data.interestTrend.won.avgDelta ?? 0) >= 0 ? C.green : C.red }} className="font-mono font-semibold">
                        (Δ {(data.interestTrend.won.avgDelta ?? 0) >= 0 ? "+" : ""}{data.interestTrend.won.avgDelta!.toFixed(1)})
                      </span>
                    </span>
                  )}
                  {data.interestTrend.lost.avgEntry != null && data.interestTrend.lost.avgExit != null && (
                    <span>
                      Lost: entry{" "}
                      <span className="font-mono text-white">{data.interestTrend.lost.avgEntry.toFixed(1)}</span>
                      {" → "}close{" "}
                      <span className="font-mono text-white">{data.interestTrend.lost.avgExit.toFixed(1)}</span>
                      {" "}
                      <span style={{ color: (data.interestTrend.lost.avgDelta ?? 0) >= 0 ? C.green : C.red }} className="font-mono font-semibold">
                        (Δ {(data.interestTrend.lost.avgDelta ?? 0) >= 0 ? "+" : ""}{data.interestTrend.lost.avgDelta!.toFixed(1)})
                      </span>
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Hot leads */}
        <Card>
          <CardHeader>
            <CardTitle>🔥 Hot Leads</CardTitle>
            <CardDescription>Active clients with current interest ≥ 7 and no activity in 14+ days — follow up now</CardDescription>
          </CardHeader>
          <CardContent>
            {data.hotLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hot leads right now.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {data.hotLeads.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <Link to="/clients/$id" params={{ id: c.id }} className="hover:text-primary">{c.name}</Link>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={
                        c.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
                        c.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
                        "border-stage-3/30 text-stage-3 bg-stage-3/10"
                      }>Stage {c.current_stage}</Badge>
                      <span className="text-sm font-mono font-semibold text-primary">{c.currentInterest.toFixed(1)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Closers</CardTitle><CardDescription>By won clients — who pushed the deal over the line</CardDescription></CardHeader>
          <CardContent>
            {data.topUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversions yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.topUsers.map((u, i) => (
                  <li key={u.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
                      {u.name}
                    </span>
                    <Badge className="bg-stage-3/15 text-stage-3 border-stage-3/30" variant="outline">
                      <span className="font-mono">{u.wins}</span>&nbsp;wins
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {data.bestCategory && (
              <p className="text-sm mt-4">
                <span className="text-muted-foreground">Best converting category: </span>
                <span className="font-semibold text-primary">{data.bestCategory}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Sourcers</CardTitle><CardDescription>By clients added — who brings in the most leads</CardDescription></CardHeader>
          <CardContent>
            {data.topSourcers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.topSourcers.map((u, i) => (
                  <li key={u.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground w-4">{i + 1}</span>
                      {u.name}
                    </span>
                    <Badge variant="outline" className="bg-stage-2/10 text-stage-2 border-stage-2/30">
                      <span className="font-mono">{u.added}</span>&nbsp;added
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-stage-1" /> Stale Clients
            </CardTitle>
            <CardDescription>No activity in 14+ days — review before they hang forever</CardDescription>
          </CardHeader>
          <CardContent>
            {data.staleClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing stale. Nice.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-auto">
                {data.staleClients.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <Link to="/clients/$id" params={{ id: c.id }} className="hover:text-primary">{c.name}</Link>
                    <Badge variant="outline" className={
                      c.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
                      c.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
                      c.current_stage === 3 ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
                      ""
                    }>Stage {c.current_stage}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        </div>{/* end Pipeline & Analysis grid */}
      </div>{/* end Pipeline & Analysis section */}
    </div>
  );
}

// ── Deal Stage Conversion Rate card ─────────────────────────────────────────
// Two self-consistent views toggled by the user:
//   Progression: Stage N → N+1 (true funnel drop-off at each step)
//   Cumulative:  Stage N → Won  (of everyone who reached Stage N, how many won?)
// Both use the same denominator (confirmed stage membership) so the numbers
// are mathematically consistent and comparable across views.
function SalesCycleLengthCard({
  avgCycleDays,
  medianCycleDays,
  minCycleDays,
  maxCycleDays,
  cycleByRep,
}: {
  avgCycleDays: number | null;
  medianCycleDays: number | null;
  minCycleDays: number | null;
  maxCycleDays: number | null;
  cycleByRep: { name: string; avg: number; deals: number }[];
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => setOpen(false), []);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" /> Sales Cycle Length
            </CardTitle>
            <CardDescription>Average days from first contact to won — overall and per rep</CardDescription>
          </div>
          {avgCycleDays != null && (
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-xs text-muted-foreground">Mean</p>
                <p className="text-2xl font-bold font-mono" style={{ color: C.blue }}>
                  {avgCycleDays.toFixed(0)}<span className="text-sm font-normal text-muted-foreground">d</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Median</p>
                <p className="text-2xl font-bold font-mono" style={{ color: C.teal }}>
                  {medianCycleDays != null ? medianCycleDays.toFixed(0) : "—"}<span className="text-sm font-normal text-muted-foreground">d</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Range</p>
                <p className="text-lg font-semibold font-mono text-muted-foreground">
                  {minCycleDays != null ? minCycleDays.toFixed(0) : "—"}–{maxCycleDays != null ? maxCycleDays.toFixed(0) : "—"}d
                </p>
              </div>
            </div>
          )}
        </div>
        {/* Collapsible math */}
        <div className="pt-1">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            How it's calculated
          </button>
          {open && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground border-t border-border pt-2">
              <p className="font-medium text-foreground">Formula</p>
              <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                Cycle days = date of "won" event − client created_at
              </p>
              <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                Mean = Σ(cycle days) ÷ number of won deals
              </p>
              <p>Only <span className="text-foreground">won deals</span> are included — active and lost clients don't have a defined end date so they're excluded. Each rep's bar shows their personal mean across all their won deals.</p>
              <p className="font-medium text-foreground mt-1">Mean vs Median</p>
              <p>
                <span className="text-foreground">Mean</span> — sum of all cycle days divided by deal count. Can be pulled up by a single long deal.{" "}
                <span className="text-foreground">Median</span> — the middle value when sorted; more resistant to outliers. If median is much lower than mean, one or two slow deals are skewing the average.
              </p>
              {avgCycleDays != null && (
                <div className="space-y-1 pt-1">
                  <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">Mean: {avgCycleDays.toFixed(1)}d</p>
                  {medianCycleDays != null && <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">Median: {medianCycleDays.toFixed(1)}d</p>}
                  {minCycleDays != null && maxCycleDays != null && (
                    <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">Range: {minCycleDays.toFixed(1)}d – {maxCycleDays.toFixed(1)}d</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {cycleByRep.length === 0 ? (
          <p className="text-sm text-muted-foreground">No won deals yet — cycle data will appear once deals are closed.</p>
        ) : (
          <div style={{ height: Math.max(160, cycleByRep.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cycleByRep}
                layout="vertical"
                margin={{ left: 8, right: 64, top: 4, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="cycleGrad" x1="1" y1="0" x2="0" y2="0">
                    <stop offset="0%" stopColor={C.blue} stopOpacity={1} />
                    <stop offset="100%" stopColor={C.blue} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis
                  type="number"
                  unit="d"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: C.axis, fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: C.white, fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, _: any, entry: any) => [
                    `${(value as number).toFixed(0)}d avg (${entry.payload.deals} ${entry.payload.deals === 1 ? "deal" : "deals"})`,
                    "Cycle",
                  ]}
                />
                <Bar dataKey="avg" fill="url(#cycleGrad)" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  <LabelList
                    dataKey="avg"
                    position="right"
                    formatter={(v: any) => `${(v as number).toFixed(0)}d`}
                    style={{ fill: C.white, fontSize: 11 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeadToOpportunityCard({
  rate,
  qualified,
  total,
}: {
  rate: number;
  qualified: number;
  total: number;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => setOpen(false), []);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
          <span>Lead-to-Opportunity Rate</span>
          <Users className="h-4 w-4" />
        </div>
        <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.blue }}>
          {(rate * 100).toFixed(1)}%
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {qualified} of {total} leads qualified to Stage 2+
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          How it's calculated
        </button>
        {open && (
          <div className="mt-2 space-y-2 text-xs text-muted-foreground border-t border-border pt-2">
            <p className="font-medium text-foreground">Formula</p>
            <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
              Rate = clients at Stage 2+ ÷ all leads
            </p>
            <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
              {qualified} ÷ {total} = {(rate * 100).toFixed(1)}%
            </p>
            <p className="font-medium text-foreground mt-2">Why total leads?</p>
            <p>
              A lead is a lead — regardless of what stage they enter at. A client who
              was discussed, agreed in principle, and added directly at Stage 3 was
              still a lead before the deal closed. CRAS records reality, not just the
              pipeline journey. Every client in the system counts as a lead from the
              moment they were added.
            </p>
            <p className="font-medium text-foreground mt-2">What counts as an opportunity?</p>
            <p>
              Any client confirmed at Stage 2 or higher — either currently or at any
              point in their history based on stage events. Stage 2+ means the
              conversation moved beyond initial contact into active engagement.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HotLeadCoverageCard({
  rate,
  total,
  withFollowUp,
  leads,
}: {
  rate: number | null;
  total: number;
  withFollowUp: number;
  leads: Array<{ id: string; name: string; current_stage: number; currentInterest: number; daysSinceActivity: number; hasFollowUp: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => setOpen(false), []);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
          <span>Hot Lead Coverage</span>
          <Flame className="h-4 w-4" />
        </div>
        <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.red }}>
          {rate != null ? `${(rate * 100).toFixed(0)}%` : "—"}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {withFollowUp} / {total} hot leads have a scheduled follow-up
        </p>
        {total > 0 && rate === 0 && (
          <p className="text-xs text-amber-400 mt-1">No hot leads have a follow-up scheduled</p>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {open ? "Hide" : "Show"} hot leads ({total})
        </button>
        {open && (
          <div className="mt-2 space-y-2 border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">
              Active clients with current interest ≥ 7, sorted by interest. 🔥 = has a scheduled follow-up.
            </p>
            {leads.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No hot leads right now.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {leads.map((c) => (
                  <Link
                    key={c.id}
                    to="/clients/$id"
                    params={{ id: c.id }}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors hover:bg-accent"
                    style={{
                      borderColor: c.hasFollowUp ? C.green : C.redMuted,
                      color: c.hasFollowUp ? C.green : C.white,
                    }}
                    title={`Stage ${c.current_stage} · Interest ${c.currentInterest} · ${c.daysSinceActivity}d since activity`}
                  >
                    {c.hasFollowUp ? "🔥" : "⚠️"} {c.name}
                    <span
                      className="ml-0.5 font-mono text-[10px] opacity-70"
                    >
                      {c.currentInterest}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineQualityCard({ score }: { score: number | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => () => setOpen(false), []);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
          <span>Pipeline Quality Score</span>
          <Star className="h-4 w-4" />
        </div>
        <div className="text-3xl font-bold mt-1 font-mono" style={{ color: C.purple }}>
          {score != null ? score.toFixed(1) : "—"}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Interest × stage weight avg — above 10 is healthy
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          How it's calculated
        </button>
        {open && (
          <div className="mt-2 space-y-2 text-xs text-muted-foreground border-t border-border pt-2">
            <p className="font-medium text-foreground">Formula</p>
            <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
              Score = Σ(interest × stage_weight) ÷ active clients with interest
            </p>
            <p className="font-medium text-foreground mt-2">Stage weights</p>
            <div className="grid grid-cols-3 gap-1 font-mono text-[11px]">
              <span className="bg-muted/40 rounded px-2 py-1">Stage 1 → ×1</span>
              <span className="bg-muted/40 rounded px-2 py-1">Stage 2 → ×2</span>
              <span className="bg-muted/40 rounded px-2 py-1">Stage 3 → ×3</span>
            </div>
            <p className="mt-1">
              Interest uses the <span className="text-foreground">most recent value</span> recorded in stage events (not the entry value). A client at Stage 3 with interest 8 contributes <span className="font-mono text-foreground">8 × 3 = 24</span>; a Stage 1 client with interest 5 contributes <span className="font-mono text-foreground">5 × 1 = 5</span>.
            </p>
            <p>
              Benchmark: <span className="text-foreground font-medium">above 10</span> = healthy mix of high-interest clients in advanced stages.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StageConversionCard({
  data,
}: {
  data: { progression: { label: string; stage: number; numerator: number; denominator: number; rate: number }[]; cumulative: { label: string; stage: number; numerator: number; denominator: number; rate: number }[] };
}) {
  const [view, setView] = useState<"progression" | "cumulative">("progression");
  const [open, setOpen] = useState(false);
  // Close dropdown when user navigates away (component unmounts)
  useEffect(() => () => setOpen(false), []);

  const rows = view === "progression" ? data.progression : data.cumulative;
  const chartData = rows.map((r) => ({ ...r, ratePct: Math.round(r.rate * 100) }));

  const STAGE_COLORS = [C.red, C.amber, C.teal];
  const gradId = view === "progression" ? "stageProgGrad" : "stageCumGrad";
  const barColor = view === "progression" ? C.teal : C.amber;

  const descriptions = {
    progression: "Of clients at Stage N, what % advanced to the next stage?",
    cumulative:  "Of clients that ever reached Stage N, what % were ultimately won?",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle>Deal Stage Conversion Rate</CardTitle>
            <CardDescription>{descriptions[view]}</CardDescription>
          </div>
          <div className="flex rounded-md border border-border text-xs overflow-hidden shrink-0">
            <button
              onClick={() => setView("progression")}
              className={`px-3 py-1.5 transition-colors ${view === "progression" ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
            >
              Progression
            </button>
            <button
              onClick={() => setView("cumulative")}
              className={`px-3 py-1.5 border-l border-border transition-colors ${view === "cumulative" ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
            >
              Win Rate
            </button>
          </div>
        </div>
        {/* Collapsible math explanation */}
        <div className="pt-1">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            How it's calculated
          </button>
          {open && (
            <div className="mt-2 space-y-2 text-xs text-muted-foreground border-t border-border pt-2">
              {view === "progression" ? (
                <>
                  <p className="font-medium text-foreground">Progression view</p>
                  <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                    Rate = clients with a progress event from Stage N ÷ clients confirmed at Stage N
                  </p>
                  <p>Each row answers: of everyone we know was at this stage, how many actually moved forward? Confirmed means they are currently there, or a stage event explicitly records them passing through.</p>
                  <div className="space-y-1 pt-1">
                    {data.progression.map((r) => (
                      <p key={r.stage} className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                        {r.label}: {r.numerator} ÷ {r.denominator} = {r.denominator > 0 ? Math.round(r.rate * 100) : "—"}%
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-medium text-foreground">Win Rate view</p>
                  <p className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                    Rate = won clients who passed through Stage N ÷ all clients confirmed at Stage N
                  </p>
                  <p>Answers: of everyone who ever reached this stage, what % ultimately won? Higher stages should show higher win rates.</p>
                  <div className="space-y-1 pt-1">
                    {data.cumulative.map((r) => (
                      <p key={r.stage} className="font-mono bg-muted/40 rounded px-2 py-1 text-[11px]">
                        {r.label}: {r.numerator} ÷ {r.denominator} = {r.denominator > 0 ? Math.round(r.rate * 100) : "—"}%
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 52, top: 4, bottom: 4 }}>
            <defs>
              <linearGradient id={gradId} x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%" stopColor={barColor} stopOpacity={1} />
                <stop offset="100%" stopColor={barColor} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              unit="%"
              tickLine={false}
              axisLine={false}
              tick={{ fill: C.axis, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={116}
              tickLine={false}
              axisLine={false}
              tick={{ fill: C.white, fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
              formatter={(_: any, __: any, entry: any) => {
                const p = entry.payload;
                return [
                  `${p.ratePct}% — ${p.numerator} of ${p.denominator} clients`,
                  view === "progression" ? "Advanced" : "Won",
                ];
              }}
            />
            <Bar dataKey="ratePct" fill={`url(#${gradId})`} radius={[0, 6, 6, 0]} maxBarSize={32}>
              {chartData.map((_, idx) => (
                <Cell key={idx} fill={STAGE_COLORS[idx % STAGE_COLORS.length]} fillOpacity={0.85} />
              ))}
              <LabelList
                dataKey="ratePct"
                position="right"
                formatter={(v: any) => (v as number) > 0 ? `${v}%` : "—"}
                style={{ fill: C.white, fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// Shared horizontal bar chart for "what's winning" comparisons.
// Each bar gets a distinct colour from RANKED_PALETTE for easy visual scan.
function RankedBarChart({
  data,
}: {
  data: { name: string; value: number; pct: number }[];
}) {
  const config: ChartConfig = {
    value: { label: "Count", color: C.red },
  };
  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={C.grid} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
        <ChartTooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: RANKED_PALETTE[data.findIndex((d) => d.name === item.payload.name) % RANKED_PALETTE.length] }} />
                    <span className="text-muted-foreground">{item.payload.name}</span>
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {value} ({item.payload.pct}%)
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((_, idx) => (
            <Cell key={idx} fill={RANKED_PALETTE[idx % RANKED_PALETTE.length]} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: unknown) => (v === undefined || v === null ? "" : `${v}%`)}
            style={{ fill: C.axis, fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Horizontal bar chart for per-product breakdowns with a single accent color.
function ProductBarChart({
  data,
  color,
  gradientId,
}: {
  data: { name: string; value: number; pct: number }[];
  color: string;
  gradientId: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.65} />
            <stop offset="100%" stopColor={color} stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: C.axis, fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={108} tickLine={false} axisLine={false} tick={{ fill: C.white, fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: any, _: any, entry: any) => [
            `${value} (${entry.payload.pct}%)`,
            "Clients",
          ]}
        />
        <Bar dataKey="value" fill={`url(#${gradientId})`} radius={[0, 6, 6, 0]} maxBarSize={28}>
          <LabelList dataKey="pct" position="right" formatter={(v: unknown) => (v == null ? "" : `${v}%`)} style={{ fill: C.axis, fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Renders the 3-stage pipeline as a true funnel: each stage's width is
// proportional to its share of stage 1, and the connector between stages
// is labeled with the advance rate — the metric admins actually need.
function Funnel({
  stages,
}: {
  stages: { stage: string; count: number; advanceRate: number | null }[];
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-1">
      {stages.map((s, i) => {
        const widthPct = Math.max((s.count / max) * 100, 14);
        const style = STAGE_STYLES[Math.min(i, STAGE_STYLES.length - 1)];
        return (
          <div key={s.stage}>
            {i > 0 && s.advanceRate !== null && (
              <div className="flex items-center gap-2 py-1.5 pl-2">
                <div className="h-3 w-px bg-border" />
                <span className="text-xs text-muted-foreground font-mono">
                  {s.advanceRate}% advance from {stages[i - 1].stage}
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div
                className={`h-12 rounded-md flex items-center justify-between px-4 transition-all border ${style.bg} ${style.border}`}
                style={{ width: `${widthPct}%`, minWidth: "180px" }}
              >
                <span className={`text-sm font-medium ${style.text}`}>{s.stage}</span>
                <span className={`font-mono text-lg font-semibold ${style.text}`}>{s.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
  valueColor,
  valueClassName,
  tooltip,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: boolean;
  valueColor?: string;
  valueClassName?: string;
  tooltip?: string;
}) {
  return (
    <Card className={accent ? "border-primary/40 bg-primary/5" : ""} title={tooltip}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
          <span className={tooltip ? "underline decoration-dotted cursor-help" : ""}>{label}</span>
          {icon}
        </div>
        <div
          className={`text-3xl font-bold mt-1 font-mono ${accent ? "text-primary" : ""} ${valueClassName ?? ""}`}
          style={valueColor ? { color: valueColor } : undefined}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
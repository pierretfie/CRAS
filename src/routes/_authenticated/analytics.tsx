import { createFileRoute } from "@tanstack/react-router";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAIDrawer } from "@/hooks/use-ai-drawer";
import { Link } from "@tanstack/react-router";
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
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { TrendingUp, Users, Trophy, AlertTriangle, MessageSquareText } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

const RED = "oklch(0.62 0.23 25)";
const RED_MUTED = "oklch(0.45 0.15 25)";
const WHITE = "oklch(0.95 0 0)";

const channelChartConfig: ChartConfig = {
  value: { label: "Leads", color: "var(--color-value)" },
} satisfies ChartConfig;

const categoryChartConfig: ChartConfig = {
  value: { label: "Clients", color: "var(--color-value)" },
} satisfies ChartConfig;

const timeseriesChartConfig: ChartConfig = {
  count: { label: "Clients", color: "oklch(0.62 0.23 25)" },
} satisfies ChartConfig;

const STAGE_STYLES = [
  { bg: "bg-stage-1/10", border: "border-stage-1/30", text: "text-stage-1" },
  { bg: "bg-stage-2/10", border: "border-stage-2/30", text: "text-stage-2" },
  { bg: "bg-stage-3/10", border: "border-stage-3/30", text: "text-stage-3" },
];

function AnalyticsPage() {
  const { data, isLoading } = useAnalyticsData();
  const { toggle } = useAIDrawer();

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading analytics…</div>;
  }

  const conv = (data.conversion * 100).toFixed(1);

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

  // Drop-off between consecutive funnel stages: the number admins actually
  // act on, and the thing the old bar chart never surfaced.
  const funnelWithDropoff = data.funnel.map((stage, i) => {
    const prev = i > 0 ? data.funnel[i - 1].count : null;
    const advanceRate = prev && prev > 0 ? Math.round((stage.count / prev) * 100) : null;
    return { ...stage, advanceRate };
  });

  const productTotal = Object.values(data.byProduct).reduce((a: number, b: number) => a + b, 0) || 1;
  const productData = Object.entries(data.byProduct)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / productTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  const wonByProductData = Object.entries(data.wonByProduct)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / productTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  const enquiredByProductData = Object.entries(data.enquiredByProduct)
    .map(([name, value]) => ({ name, value: value as number, pct: Math.round(((value as number) / productTotal) * 100) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Live conversion and acquisition metrics</p>
        </div>
        <Button variant="outline" onClick={toggle}>
          <MessageSquareText className="h-4 w-4 mr-2" />Ask the AI
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Conversion Rate" value={`${conv}%`} icon={<TrendingUp className="h-4 w-4" />} accent />
        <Kpi label="Total Clients" value={data.total} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Won" value={data.won} icon={<Trophy className="h-4 w-4" />} valueClassName="text-stage-3" />
        <Kpi label="Stale" value={data.stale} icon={<AlertTriangle className="h-4 w-4" />} valueClassName="text-stage-1" />
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
          <CardHeader><CardTitle>Mode of Connection</CardTitle><CardDescription>Where leads come from, ranked</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={modeData} config={channelChartConfig} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Categories</CardTitle><CardDescription>Service mix, ranked</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={catData} config={categoryChartConfig} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Clients Added (last 8 weeks)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ChartContainer config={timeseriesChartConfig} className="h-full w-full">
              <LineChart data={data.timeseries} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-count)", r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Products</CardTitle><CardDescription>All clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={productData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.01 260)" />
                <XAxis type="number" stroke={WHITE} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={WHITE} width={100} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
                <Bar dataKey="value" fill={RED} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sold by Product</CardTitle><CardDescription>Won clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={wonByProductData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.01 260)" />
                <XAxis type="number" stroke={WHITE} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={WHITE} width={100} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
                <Bar dataKey="value" fill={RED} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Enquired by Product</CardTitle><CardDescription>Active clients per product</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={enquiredByProductData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.01 260)" />
                <XAxis type="number" stroke={WHITE} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={WHITE} width={100} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
                <Bar dataKey="value" fill={RED} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Top Performers</CardTitle><CardDescription>By wins</CardDescription></CardHeader>
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-stage-1" /> Stale Clients
            </CardTitle>
            <CardDescription>No activity in 30+ days — review before they hang forever</CardDescription>
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
      </div>
    </div>
  );
}

// Shared horizontal bar chart for "what's winning" comparisons (channels,
// categories). Ranked descending, with count + share-of-total shown together
// so neither chart needs a separate pie.
function RankedBarChart({
  data,
  config,
}: {
  data: { name: string; value: number; pct: number }[];
  config: ChartConfig;
}) {
  return (
    <ChartContainer config={config} className="h-full w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" width={110} className="text-xs" tickLine={false} axisLine={false} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => (
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: "var(--color-value)" }} />
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
        <Bar dataKey="value" fill="var(--color-value)" radius={[0, 6, 6, 0]} maxBarSize={28}>
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: unknown) => (v === undefined || v === null ? "" : `${v}%`)}
            className="fill-foreground text-xs"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
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
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: boolean;
  valueClassName?: string;
}) {
  return (
    <Card className={accent ? "border-primary/40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-3xl font-bold mt-1 font-mono ${accent ? "text-primary" : ""} ${valueClassName ?? ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
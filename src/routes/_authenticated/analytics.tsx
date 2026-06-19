import { createFileRoute, Link } from "@tanstack/react-router";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { TrendingUp, Users, Trophy, AlertTriangle, MessageSquareText } from "lucide-react";
import type { ChartConfig } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

const RED = "oklch(0.62 0.23 25)";
const RED_MUTED = "oklch(0.45 0.15 25)";
const WHITE = "oklch(0.95 0 0)";
const NEUTRAL = "oklch(0.62 0.05 260)";

const productChartConfig: ChartConfig = {
  value: { label: "Clients", color: NEUTRAL },
};

function AnalyticsPage() {
  const { data, isLoading } = useAnalyticsData();

  if (isLoading || !data) {
    return <div className="text-muted-foreground">Loading analytics…</div>;
  }

  const conv = (data.conversion * 100).toFixed(1);
  const modeData = Object.entries(data.byMode).map(([name, value]) => ({ name, value }));
  const catData = Object.entries(data.byCategory).map(([name, value]) => ({ name, value }));

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
        <Button asChild variant="outline">
          <Link to="/analytics/report"><MessageSquareText className="h-4 w-4 mr-2" />Ask the AI</Link>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Conversion Rate" value={`${conv}%`} icon={<TrendingUp className="h-4 w-4" />} accent />
        <Kpi label="Total Clients" value={data.total} icon={<Users className="h-4 w-4" />} />
        <Kpi label="Won" value={data.won} icon={<Trophy className="h-4 w-4" />} />
        <Kpi label="Stale" value={data.stale} icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Stage Funnel</CardTitle><CardDescription>Active clients per stage</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data.funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.01 260)" />
                <XAxis dataKey="stage" stroke={WHITE} />
                <YAxis stroke={WHITE} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
                <Bar dataKey="count" fill={RED} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Mode of Connection</CardTitle><CardDescription>Where leads come from</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={modeData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {modeData.map((_, i) => (
                    <Cell key={i} fill={i % 2 ? RED : RED_MUTED} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Categories</CardTitle><CardDescription>Service mix</CardDescription></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={catData} layout="vertical">
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
          <CardHeader><CardTitle>Clients Added (last 8 weeks)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={data.timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.01 260)" />
                <XAxis dataKey="label" stroke={WHITE} />
                <YAxis stroke={WHITE} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "oklch(0.20 0.012 260)", border: "1px solid oklch(0.28 0.01 260)" }} />
                <Line type="monotone" dataKey="count" stroke={RED} strokeWidth={2} dot={{ fill: RED }} />
              </LineChart>
            </ResponsiveContainer>
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
                {data.topUsers.map((u) => (
                  <li key={u.id} className="flex justify-between items-center border-b border-border pb-2 last:border-0">
                    <span>{u.name}</span>
                    <Badge variant="default">{u.wins} wins</Badge>
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
              <AlertTriangle className="h-4 w-4 text-primary" /> Stale Clients
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
                    <Badge variant="outline">Stage {c.current_stage}</Badge>
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

function Kpi({ label, value, icon, accent }: { label: string; value: React.ReactNode; icon: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40" : ""}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>{label}</span>
          {icon}
        </div>
        <div className={`text-3xl font-bold mt-1 ${accent ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

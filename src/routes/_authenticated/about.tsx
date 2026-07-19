import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/about")({
  component: AboutPage,
});

const CORE_KPIS = [
  "Close / Conversion Rate",
  "Win Rate",
  "Opportunity-to-Close Rate (OTC)",
  "Sales Velocity",
  "Average Sales Cycle Length",
  "Deal Stage Conversion Rate",
  "Lead-to-Opportunity Rate",
  "Stale Deal Rate",
  "Win Rate by Channel",
  "Activity Metrics",
];

const CRAS_KPIS = [
  "Interest-Weighted Pipeline Score",
  "Hot Lead Utilisation Rate",
  "Non-Financial Sales Velocity",
];

const PIPELINE_STAGES = [
  {
    number: 1,
    label: "Stage 1",
    description: "Initial contact and lead qualification. The client has been reached out to and is being assessed for fit.",
    bg: "bg-stage-1/10",
    border: "border-stage-1/30",
    text: "text-stage-1",
  },
  {
    number: 2,
    label: "Stage 2",
    description: "Qualified opportunity with active engagement. The client is interested and conversations are ongoing.",
    bg: "bg-stage-2/10",
    border: "border-stage-2/30",
    text: "text-stage-2",
  },
  {
    number: 3,
    label: "Stage 3",
    description: "Decision stage — close is imminent. The client is evaluating a final proposal or ready to commit.",
    bg: "bg-stage-3/10",
    border: "border-stage-3/30",
    text: "text-stage-3",
  },
];

const TRACKED_FIELDS = [
  "Name",
  "Category",
  "Product",
  "Mode of Connection",
  "Stage",
  "Interest Scale",
  "Stage Notes",
  "Contact Person",
  "Follow-ups",
  "Activity Type",
  "Won / Lost status",
  "Lost Reason",
];

function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      {/* ── Header ────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About CRAS</h1>
        <p className="text-muted-foreground mt-1">Conversion Rate Analysis System</p>
      </div>

      {/* ── Section 1 — What is CRAS? ─────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What is CRAS?</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          CRAS is a sales CRM built around conversion rate analysis. It tracks every client from
          first contact through pipeline stages to won or lost, giving sales teams a clear view of
          where deals are being won and where they are leaking. It combines industry-standard sales
          KPIs with custom-built metrics designed for teams that don't track financial deal values.
        </p>
      </section>

      {/* ── Section 2 — KPI Coverage ──────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">KPI Coverage</h2>
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Core Sales KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-5xl font-bold tracking-tight">10</p>
              <p className="text-xs text-muted-foreground mt-2">
                Industry-standard metrics — HubSpot, Salesforce, Miller Heiman, RAIN Group
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">CRAS-Native KPIs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-5xl font-bold tracking-tight">3</p>
              <p className="text-xs text-muted-foreground mt-2">
                Custom-built for this system — not standard in external literature
              </p>
            </CardContent>
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          Built with 10 core Sales KPIs and 3 custom Sales KPIs — 13 tracked metrics in total.
        </p>
      </section>

      {/* ── Section 3 — Core KPIs ─────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Core KPIs</h2>
        <ol className="space-y-1.5">
          {CORE_KPIS.map((kpi, i) => (
            <li key={kpi} className="flex items-start gap-3 text-sm">
              <span className="text-muted-foreground w-5 shrink-0 text-right font-mono">{i + 1}.</span>
              <span>{kpi}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Section 4 — CRAS-Native KPIs ─────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">CRAS-Native KPIs</h2>
        <ol className="space-y-1.5">
          {CRAS_KPIS.map((kpi, i) => (
            <li key={kpi} className="flex items-start gap-3 text-sm">
              <span className="text-muted-foreground w-5 shrink-0 text-right font-mono">{i + 1}.</span>
              <span>{kpi}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Section 5 — Pipeline Stages ───────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Pipeline Stages</h2>
        <div className="grid grid-cols-3 gap-4">
          {PIPELINE_STAGES.map((stage) => (
            <div
              key={stage.number}
              className={`rounded-lg border p-4 ${stage.bg} ${stage.border}`}
            >
              <Badge
                variant="outline"
                className={`mb-2 ${stage.border} ${stage.text} ${stage.bg}`}
              >
                {stage.label}
              </Badge>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {stage.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 6 — Data tracked per client ───────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data Tracked Per Client</h2>
        <div className="flex flex-wrap gap-2">
          {TRACKED_FIELDS.map((field) => (
            <Badge key={field} variant="outline" className="text-xs font-normal">
              {field}
            </Badge>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t pt-6 space-y-3">
        <p className="text-xs text-muted-foreground">
          Sales KPI benchmarks sourced from: HubSpot State of Sales, Salesforce Sales Performance
          Report, Miller Heiman CSO Insights, RAIN Group research.
        </p>
        <Link
          to="/metrics"
          className="text-sm text-primary hover:underline underline-offset-4"
        >
          View full KPI reference →
        </Link>
      </footer>
    </div>
  );
}

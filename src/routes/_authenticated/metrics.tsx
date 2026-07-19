import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Trophy, Users, AlertTriangle, BarChart3, Target, Clock, Flame, Star, Zap, Globe, Cpu } from "lucide-react";

export const Route = createFileRoute("/_authenticated/metrics")({
  component: MetricsPage,
});

// ── Types ──────────────────────────────────────────────────────────────────

type Tag = "conversion" | "pipeline" | "activity" | "quality" | "velocity";
type Origin = "core" | "cras";

interface Metric {
  name: string;
  aka?: string;           // alternative name used in literature
  formula: string;
  description: string;
  why: string;
  benchmark?: string;
  crasNote?: string;      // how CRAS specifically implements it
  icon: React.ReactNode;
  color: string;
  tag: Tag;
  origin: Origin;         // "global" = published in sales literature | "cras" = custom-built
}

// ── Metric definitions ─────────────────────────────────────────────────────

const METRICS: Metric[] = [

  // ── GLOBALLY RECOGNISED ──────────────────────────────────────────────────

  {
    name: "Win Rate",
    formula: "Won ÷ (Won + Lost) × 100",
    description:
      "The percentage of closed opportunities that ended as a win. Only decided deals count — active clients are excluded. This measures deal execution quality once a client reaches a final decision.",
    why:
      "Tells you how effectively your team closes when it gets to a final decision. A low win rate with a healthy pipeline means you're bringing in leads but losing them late. Isolates closing skill from sourcing volume.",
    benchmark:
      "Typically 20–30% across B2B industries. Above 35% is strong. Highly variable by sector and deal complexity.",
    crasNote:
      "First KPI on the Analytics dashboard. Computed as won ÷ (won + lost). Active clients are not included in the denominator.",
    icon: <Trophy className="h-5 w-5" />,
    color: "text-stage-3",
    tag: "conversion",
    origin: "core",
  },

  {
    name: "Close Rate",
    aka: "Lead-to-Close Rate · CRAS Core Metric",
    formula: "Won ÷ Total Leads Ever Entered × 100",
    description:
      "The percentage of all leads that ever entered the pipeline that were eventually won. Uses the full lead pool as the denominator — including still-active and lost deals. This is the full-funnel conversion view from first contact to won client.",
    why:
      "Where win rate evaluates closing execution, close rate evaluates your entire pipeline from first touch. A low close rate can mean poor lead quality, poor qualification, or both — even if the win rate looks healthy. It's the most complete measure of sales system efficiency.",
    benchmark:
      "Always lower than win rate since the denominator is larger. Use directionally — compare across time periods or reps rather than against an external number.",
    crasNote:
      "The headline KPI on the Analytics dashboard and the founding metric of CRAS (Conversion Rate Analysis System). Computed as won ÷ total clients ever added. This is what CRAS was built to track and improve.",
    icon: <Target className="h-5 w-5" />,
    color: "text-primary",
    tag: "conversion",
    origin: "core",
  },

  {
    name: "Opportunity-to-Close Rate",
    aka: "OTC Rate",
    formula: "Won ÷ Total Qualified Opportunities × 100",
    description:
      "The percentage of qualified opportunities — clients who advanced to Stage 2 or above — that were eventually won. Widely regarded as the most meaningful standard for measuring closed-deal success.",
    why:
      "Captures end-to-end pipeline efficiency. A high win rate but low OTC means your team closes well but loses too many deals before they get to decision stage. The gap between the two reveals where in the funnel you're leaking.",
    benchmark:
      "20–30% typical across most industries. Above 35% is excellent. B2B SaaS/Tech: 15–35% · Professional Services: 25–40% · Manufacturing: 15–25% · E-commerce: 1–3%",
    crasNote:
      "Shown as the second KPI card on the Analytics dashboard. Qualified opportunity = any client who ever reached Stage 2 or above, or has been won/lost regardless of current stage.",
    icon: <Target className="h-5 w-5" />,
    color: "text-primary",
    tag: "conversion",
    origin: "core",
  },

  {
    name: "Sales Velocity",
    aka: "Pipeline Velocity",
    formula: "(Qualified Opportunities × Win Rate × Avg Deal Value) ÷ Avg Sales Cycle Days",
    description:
      "How fast deals move through your pipeline. The original formula uses deal value to produce a revenue-per-day figure. CRAS tracks a non-financial version using client count and cycle speed instead — giving you a deals-per-day throughput rate.",
    why:
      "The single most actionable pipeline metric. You can improve it by: increasing qualified opportunities (sourcing), improving win rate (qualification/closing), or shortening the cycle (process speed). Each lever is independently measurable.",
    benchmark:
      "No universal benchmark — the absolute number is less important than the trend. A rising velocity means your pipeline is becoming more efficient. A falling velocity is an early warning sign before revenue drops.",
    crasNote:
      "CRAS tracks a non-financial Sales Velocity using: Qualified Opps × OTC Rate ÷ Avg Sales Cycle (days from Stage 1 to won event). Result = deals closed per day. Shown on the Analytics dashboard.",
    icon: <Zap className="h-5 w-5" />,
    color: "text-amber-400",
    tag: "velocity",
    origin: "core",
  },

  {
    name: "Deal Stage Conversion Rate",
    aka: "Stage-to-Stage Progression Rate",
    formula: "Clients that progressed from Stage N → Stage N+1 ÷ Clients that entered Stage N × 100",
    description:
      "The percentage of clients that advanced from one specific pipeline stage to the next. Computed separately for each transition: Stage 1 → 2, Stage 2 → 3, and each stage to Won. Each rate pinpoints exactly where the funnel is leaking.",
    why:
      "Aggregate conversion metrics hide where you're losing deals. A healthy close rate can mask a Stage 1 → 2 qualification problem, or a Stage 3 → Won closing problem. Breaking the funnel into individual transitions lets you direct improvement effort at the specific stage that is underperforming.",
    benchmark:
      "Stage 1 → 2: 20–40% is typical for B2B (qualification filter). Stage 2 → 3: 40–70% (active progression). Stage → Won: highly industry-dependent. Use your own trend over time as the benchmark.",
    crasNote:
      "Computed from client_stage_events. Denominator = unique clients that ever entered the from-stage (via progress events or current_stage). Numerator = unique clients that made the specific transition. Tracked for Stage 1→2, Stage 2→3, and each stage→Won. Shown as a horizontal bar chart on the Analytics dashboard.",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-teal-400",
    tag: "pipeline",
    origin: "core",
  },

  {
    name: "Lead-to-Opportunity Rate",
    aka: "Lead Qualification Rate",
    formula: "Clients reaching Stage 2+ ÷ Total Stage 1 Entries × 100",
    description:
      "The percentage of initial leads (Stage 1) that qualify into real opportunities (Stage 2+). Measures how well the team identifies and advances promising leads past the first contact.",
    why:
      "A low rate points to either poor lead quality (a sourcing problem) or failure to advance real prospects (a process or activity problem). Separating those two causes is the first step to fixing the funnel.",
    benchmark: "Typically 20–40% for most B2B sales teams.",
    crasNote:
      "Computable from CRAS data: count clients who ever reached Stage 2+ divided by all clients ever entered. Visible in the Analytics funnel section.",
    icon: <Users className="h-5 w-5" />,
    color: "text-blue-400",
    tag: "pipeline",
    origin: "core",
  },

  {
    name: "Average Sales Cycle Length",
    aka: "Time to Close",
    formula: "Σ (Days from first contact to Won) ÷ Number of Won Deals",
    description:
      "How long it takes on average to convert a lead into a won client. Measured from the date the client was added to the date the won event was logged.",
    why:
      "Longer cycles mean higher cost-of-sale and delayed revenue. Tracking this over time reveals whether process changes are having any effect and which stages are bottlenecks.",
    benchmark:
      "B2B SMB: 30–90 days · Enterprise: 3–12 months · Transactional/SME: 1–30 days.",
    crasNote:
      "Tracked in CRAS using the gap between client created_at and the timestamp of the 'won' event in client_stage_events. Shown as a KPI card on the Analytics dashboard with mean, median, and min/max range. A per-rep breakdown chart shows who closes fastest — sorted fastest-first. Used as the cycle denominator in Sales Velocity.",
    icon: <Clock className="h-5 w-5" />,
    color: "text-teal-400",
    tag: "activity",
    origin: "core",
  },

  {
    name: "Win Rate by Channel",
    aka: "Channel Conversion Rate",
    formula: "Won from Channel X ÷ All Clients from Channel X × 100",
    description:
      "Close rate broken down by acquisition channel (mode of connection). Identifies which channels produce the highest-quality leads — not just the most leads.",
    why:
      "Volume and quality rarely come from the same channel. A channel driving 10% of leads with a 60% win rate deserves more investment than one driving 40% of leads at 5%. This metric makes that trade-off explicit.",
    benchmark: "Internal — compare channels against each other rather than an external baseline.",
    crasNote:
      "Visible in the Mode of Connection chart on Analytics. Win counts per channel are in the pipeline data powering that chart.",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-blue-400",
    tag: "quality",
    origin: "core",
  },

  {
    name: "Stale Deal Rate",
    aka: "Pipeline Decay Rate",
    formula: "Stale Active Clients ÷ Total Active Clients × 100",
    description:
      "The percentage of active clients with no logged activity in 14+ days. A 'stale' client is one where no stage event has been recorded within the threshold — the deal has effectively gone cold.",
    why:
      "Stale deals are the silent killers of pipelines. A rising stale rate is an early warning sign before win rate drops. It can point to an overloaded team, poor follow-up discipline, or deals that should already be marked lost.",
    benchmark: "Under 10% is healthy. Above 25% warrants a pipeline review and potentially a pipeline clean-up.",
    crasNote:
      "Tracked in real time. The 14-day threshold is configurable in CRAS. Stale clients appear in the Stale Clients list on Analytics and are surfaced as hot alerts.",
    icon: <AlertTriangle className="h-5 w-5" />,
    color: "text-amber-400",
    tag: "activity",
    origin: "core",
  },

  {
    name: "Activity Metrics",
    aka: "Outreach Volume · Sales Activity KPIs",
    formula: "Count of logged outreach actions per rep per day (calls + emails + meetings + messages …)",
    description:
      "The daily volume of outbound outreach each rep executes — phone calls, emails, WhatsApp messages, meetings, DMs, demos, and every other contact method logged in the system. Activity metrics track input effort, not deal outcomes.",
    why:
      "Every outcome metric (win rate, close rate, velocity) is a lagging indicator — it tells you what already happened. Activity metrics are leading indicators: they tell you whether the pipeline will be healthy in 30–60 days. A rep with zero logged calls this week will have zero new opportunities next month. Tracking volume holds the team accountable to the inputs they fully control.",
    benchmark:
      "Varies widely by role and sales motion. Inside sales: 50–100 dials/day is a common target. Email: 30–50/day. Meetings: 3–5/week. Use your own team's baseline and trend rather than external numbers.",
    crasNote:
      "Tracked via the activity_type field logged on every stage update and follow-up check-in. Methods: Phone Call, WhatsApp, Email, SMS, LinkedIn, Instagram DM, Facebook DM, X/Twitter DM, Telegram, Physical Meeting, Video Call, Conference, Demo, Referral Introduction. Shown on the Analytics dashboard as total by method, by rep, and a 14-day daily trend.",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "text-blue-400",
    tag: "activity",
    origin: "core",
  },

  // ── CRAS CUSTOM ───────────────────────────────────────────────────────────

  {
    name: "Interest-Weighted Pipeline Score",
    formula: "Σ (Interest Scale × Stage Weight) ÷ Active Clients",
    description:
      "A composite pipeline quality score unique to CRAS. Each active client is scored by multiplying their interest scale (1–10) by a stage weight (Stage 1 = 1×, Stage 2 = 2×, Stage 3 = 3×). The average across all active clients gives a single quality index.",
    why:
      "Raw deal count is a poor proxy for pipeline health. A pipeline of 50 Stage 1 clients with interest 2/10 is far weaker than 10 Stage 3 clients with interest 9/10. This score captures that difference in a single trackable number.",
    benchmark:
      "No external benchmark — this is a CRAS-native metric. A score above 10 indicates a healthy, engaged pipeline. Track the trend: rising = improving quality, falling = pipeline needs attention.",
    crasNote:
      "Computed from CRAS interest_scale and current_stage fields. Stage weights: 1=1, 2=2, 3=3. Maximum possible score per client = 30 (Stage 3 + interest 10).",
    icon: <Star className="h-5 w-5" />,
    color: "text-purple-400",
    tag: "quality",
    origin: "cras",
  },

  {
    name: "Hot Lead Utilisation Rate",
    formula: "Hot Leads with Active Follow-up ÷ Total Hot Leads × 100",
    description:
      "Of all high-interest (≥7 on the interest scale) active clients, what percentage have a scheduled follow-up? Hot leads sitting without a follow-up are the highest-value missed opportunity in any pipeline.",
    why:
      "High-interest clients are your most convertible assets. Leaving them without a scheduled touchpoint is the fastest way to let a warm deal go cold. This metric holds the team accountable for that specific failure mode.",
    benchmark:
      "100% is the goal — every hot lead should have a scheduled follow-up. Below 70% suggests follow-up discipline needs immediate attention.",
    crasNote:
      "Tracked using interest_scale ≥ 7 from the clients table and active rows in client_follow_ups. Hot leads with no active follow-up appear in the Hot Leads section of the Analytics dashboard.",
    icon: <Flame className="h-5 w-5" />,
    color: "text-red-400",
    tag: "quality",
    origin: "cras",
  },

  {
    name: "Non-Financial Sales Velocity",
    formula: "Qualified Opportunities × OTC Rate ÷ Avg Sales Cycle (days)",
    description:
      "A CRAS adaptation of the standard Sales Velocity formula — purpose-built for teams that don't track deal monetary value. Replaces revenue with deal throughput, giving a 'deals closed per day' rate that is fully computable from CRM activity data alone.",
    why:
      "Most velocity calculations require a deal value field. This version strips that dependency so any sales team — regardless of whether they track revenue in their CRM — can measure how fast their pipeline is actually moving.",
    benchmark:
      "No external benchmark. Use the trend: increasing = pipeline accelerating. Decreasing = slowdown in qualified volume, win rate, or cycle speed. Decompose which of the three levers is the driver.",
    crasNote:
      "Computed from CRAS data: qualifiedOpportunities × otcRate ÷ avgCycleDays. Cycle days = mean gap between created_at and the won stage event timestamp across all won clients. Tracked on the Analytics dashboard.",
    icon: <Cpu className="h-5 w-5" />,
    color: "text-teal-400",
    tag: "velocity",
    origin: "cras",
  },
];

// ── Tag / origin display config ─────────────────────────────────────────────

const TAG_LABELS: Record<Tag, string> = {
  conversion: "Conversion",
  pipeline:   "Pipeline",
  activity:   "Activity",
  velocity:   "Velocity",
  quality:    "Quality",
};

const TAG_COLORS: Record<Tag, string> = {
  conversion: "bg-stage-3/10 text-stage-3 border-stage-3/30",
  pipeline:   "bg-blue-400/10 text-blue-400 border-blue-400/30",
  activity:   "bg-amber-400/10 text-amber-400 border-amber-400/30",
  velocity:   "bg-teal-400/10 text-teal-400 border-teal-400/30",
  quality:    "bg-purple-400/10 text-purple-400 border-purple-400/30",
};

const CORE = METRICS.filter((m) => m.origin === "core");
const CUSTOM = METRICS.filter((m) => m.origin === "cras");

// ── MetricCard ─────────────────────────────────────────────────────────────

function MetricCard({ m, index }: { m: Metric; index: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-mono font-semibold text-muted-foreground">
              {index}
            </span>
            <span className={m.color}>{m.icon}</span>
            <div>
              <CardTitle className="text-base">{m.name}</CardTitle>
              {m.aka && <p className="text-xs text-muted-foreground">Also known as: {m.aka}</p>}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Badge variant="outline" className={`${TAG_COLORS[m.tag]} text-xs`}>{TAG_LABELS[m.tag]}</Badge>
          </div>
        </div>
        <div className="mt-3 inline-block rounded-md bg-muted px-3 py-1.5">
          <code className="text-xs font-mono text-foreground">{m.formula}</code>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-sm text-foreground leading-relaxed">{m.description}</p>

        <div className="space-y-0.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Why it matters</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{m.why}</p>
        </div>

        {m.benchmark && (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry benchmark</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{m.benchmark}</p>
          </div>
        )}

        {m.crasNote && (
          <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 space-y-0.5">
            <p className="text-xs font-medium text-primary uppercase tracking-wide">How CRAS tracks this</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{m.crasNote}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

function MetricsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-12">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales KPIs</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5 mb-2">Sales Performance Metrics / Key Performance Indicators</p>
        <p className="text-sm text-muted-foreground max-w-2xl">
          The metrics CRAS tracks, how they're calculated, and why they matter — grounded in
          globally recognised sales research and extended with CRAS-native indicators built
          specifically for this system.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Category:</span>
        {(Object.entries(TAG_LABELS) as [Tag, string][]).map(([key, label]) => (
          <Badge key={key} variant="outline" className={`${TAG_COLORS[key]} text-xs`}>{label}</Badge>
        ))}
      </div>

      {/* ── Section 1: Core / Standard Sales KPIs ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-border">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Core Sales KPIs</h2>
          <Badge variant="outline" className="text-xs text-muted-foreground border-border ml-auto">
            Standard Sales Metrics — HubSpot, Salesforce, Miller Heiman, RAIN Group
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Industry-standard metrics used by sales teams worldwide. Their definitions, formulas,
          and benchmarks are established in academic sales research and adopted by leading CRM platforms.
        </p>
        <div className="space-y-4">
          {CORE.map((m, i) => <MetricCard key={m.name} m={m} index={i + 1} />)}
        </div>
      </section>

      {/* ── Section 2: CRAS-native KPIs ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-primary/30">
          <Cpu className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">CRAS-Native KPIs</h2>
          <Badge variant="outline" className="text-xs text-primary border-primary/30 bg-primary/5 ml-auto">
            Custom-built for CRAS — not standard in external literature
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          These metrics were designed specifically for CRAS to fill gaps that standard KPIs leave open —
          particularly around interest-based qualification and non-financial velocity tracking.
          They have no direct equivalent in external sales benchmarks.
        </p>
        <div className="space-y-4">
          {CUSTOM.map((m, i) => <MetricCard key={m.name} m={m} index={i + 1} />)}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Global benchmarks sourced from: HubSpot State of Sales, Salesforce Sales Performance Report,
        Miller Heiman CSO Insights, RAIN Group research, Reddit r/sales community data.
        Actual performance varies by sector, deal size, and sales motion — use your own trend as the primary signal.
      </p>
    </div>
  );
}

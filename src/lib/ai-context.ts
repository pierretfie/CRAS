/**
 * Builds the full analytics context string sent to the AI.
 * Single source of truth — used by the drawer, report page, and admin console.
 *
 * Covers every metric computed by analytics-compute so the AI can answer
 * questions about funnel health, products, interest, hot leads, stale
 * clients, team performance, and follow-ups.
 */
import type { AnalyticsResult } from "@/lib/analytics-compute";

export function buildAnalyticsContext(
  analytics: AnalyticsResult,
  followUps?: any[],
  userName?: string,
): string {
  const a = analytics;
  const lines: string[] = [];

  // ── Scope header ─────────────────────────────────────────────────────────
  lines.push("=== DATA SCOPE ===");
  lines.push("This dataset covers ALL team members (full organisation view).");
  if (userName) {
    lines.push(`The currently logged-in user is: ${userName}`);
    lines.push(`When the user asks first-person questions like "how many deals have I closed" or "my clients", find their name in the TOP CLOSERS / TOP SOURCERS sections and report their specific numbers. Do NOT use the team total as the answer for an individual.`);
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  lines.push("\n=== OVERVIEW ===");
  lines.push(`Total clients: ${a.total}`);
  lines.push(`Active: ${a.active} | Won: ${a.won} | Lost: ${a.lost}`);
  lines.push(`Close Rate (CRAS core metric): ${(a.closeRate * 100).toFixed(1)}% (won ÷ total leads entered — full-funnel conversion, the founding metric of CRAS — Conversion Rate Analysis System)`);
  lines.push(`Win Rate: ${(a.winRate * 100).toFixed(1)}% (won ÷ (won + lost) — closing execution on decided deals only, excludes still-active)`);
  lines.push(`Opportunity-to-Close (OTC) rate: ${(a.otcRate * 100).toFixed(1)}% (won ÷ qualified opportunities i.e. Stage 2+ clients — industry avg 20–35%, above 35% is excellent)`);
  lines.push(`Qualified opportunities (Stage 2+): ${a.qualifiedOpportunities}`);
  lines.push(`Non-financial Sales Velocity: ${a.salesVelocity != null ? a.salesVelocity.toFixed(3) + " deals/day" : "insufficient data (need at least one won deal)"}`);
  lines.push(`Average sales cycle: ${a.avgCycleDays != null ? a.avgCycleDays.toFixed(0) + " days (from client added to won event)" : "no won deals yet"}`);
  if (a.avgCycleDays != null) {
    lines.push(`  Median cycle: ${a.medianCycleDays != null ? a.medianCycleDays.toFixed(0) + "d" : "n/a"} | Fastest: ${a.minCycleDays != null ? a.minCycleDays.toFixed(0) + "d" : "n/a"} | Slowest: ${a.maxCycleDays != null ? a.maxCycleDays.toFixed(0) + "d" : "n/a"}`);
    if (a.cycleByRep.length > 0) {
      lines.push("  Avg cycle by rep (fastest first):");
      for (const r of a.cycleByRep) {
        lines.push(`    ${r.name}: ${r.avg.toFixed(0)}d avg (${r.deals} ${r.deals === 1 ? "deal" : "deals"})`);
      }
    }
  }
  lines.push(`Stale clients (no activity in 14+ days): ${a.stale}. The stale threshold is 14 days.`);
  lines.push(`Stale deal rate: ${(a.staleDealRate * 100).toFixed(1)}% of active clients are stale`);
  lines.push(`Lead-to-opportunity rate: ${(a.leadToOpportunityRate * 100).toFixed(1)}% (leads that reached Stage 2+)`);
  lines.push(`Interest-weighted pipeline score: ${a.interestWeightedScore != null ? a.interestWeightedScore.toFixed(2) : "n/a"} (avg interest × stage weight across active clients)`);
  lines.push(`Hot lead utilisation rate: ${a.hotLeadUtilisationRate != null ? (a.hotLeadUtilisationRate * 100).toFixed(1) + "% of hot leads have an active follow-up" : "n/a"} (${a.hotLeadsWithFollowUp} of ${a.hotLeadsTotal} hot leads tracked)`);
  lines.push(`Stage 3 completions: ${a.stage3}`);

  // ── Funnel ────────────────────────────────────────────────────────────────
  lines.push("\n=== SALES FUNNEL (active clients per stage) ===");
  for (const s of a.funnel) {
    lines.push(`  ${s.stage}: ${s.count} active clients`);
  }

  // ── Mode of connection ────────────────────────────────────────────────────
  lines.push("\n=== ACQUISITION CHANNELS (mode of connection) ===");
  if (a.winRateByChannel.length === 0) {
    lines.push("  No channel data available.");
  } else {
    for (const ch of a.winRateByChannel) {
      const pct = Math.round((ch.total / (Object.values(a.byMode).reduce((s, v) => s + v, 0) || 1)) * 100);
      lines.push(
        `  ${ch.channel}: ${ch.total} clients (${pct}% of leads) | ${ch.won} won | win rate: ${(ch.rate * 100).toFixed(1)}%`
      );
    }
  }

  // ── Categories ────────────────────────────────────────────────────────────
  lines.push("\n=== SERVICE CATEGORIES ===");
  for (const [k, v] of Object.entries(a.byCategory).sort((a, b) => b[1] - a[1])) {
    const wins = a.wonByCategory[k] ?? 0;
    const convRate = v > 0 ? ((wins / v) * 100).toFixed(0) : "0";
    lines.push(`  ${k}: ${v} total, ${wins} won (${convRate}% conversion)`);
  }
  lines.push(`Best converting category: ${a.bestCategory ?? "n/a"}`);

  // ── Products ──────────────────────────────────────────────────────────────
  lines.push("\n=== PRODUCTS ===");
  for (const [k, v] of Object.entries(a.byProduct).sort((a, b) => b[1] - a[1])) {
    const won = a.wonByProduct[k] ?? 0;
    const enquired = a.enquiredByProduct[k] ?? 0;
    lines.push(`  ${k}: ${v} total | ${enquired} active | ${won} won (${Math.round((won / v) * 100)}% win rate)`);
  }

  // ── Interest scale ────────────────────────────────────────────────────────
  lines.push("\n=== INTEREST SCALE ANALYTICS (0–10) ===");
  lines.push(`  Avg entry interest — Active: ${a.interestByStatus.entry.active?.toFixed(1) ?? "n/a"} | Won: ${a.interestByStatus.entry.won?.toFixed(1) ?? "n/a"} | Lost: ${a.interestByStatus.entry.lost?.toFixed(1) ?? "n/a"}`);
  lines.push(`  Avg close interest — Won: ${a.interestByStatus.close.won?.toFixed(1) ?? "n/a"} | Lost: ${a.interestByStatus.close.lost?.toFixed(1) ?? "n/a"}`);
  lines.push("  Win rate by interest bucket:");
  for (const b of a.interestBuckets) {
    lines.push(`    ${b.label}: ${b.rate}% win rate (${b.won} won / ${b.total} total)`);
  }
  if (a.interestByProduct.length > 0) {
    lines.push("  Avg interest by product:");
    for (const p of a.interestByProduct.slice(0, 8)) {
      lines.push(`    ${p.product}: ${p.avg.toFixed(1)} avg (${p.count} clients)`);
    }
  }

  // ── Hot leads ─────────────────────────────────────────────────────────────
  lines.push("\n=== HOT LEADS (interest ≥7, no activity 14+ days) ===");
  if (a.hotLeads.length === 0) {
    lines.push("  None — all high-interest clients are being actively worked.");
  } else {
    for (const c of a.hotLeads.slice(0, 10)) {
      const days = (c as any).daysSinceActivity;
      lines.push(
        `  • ${c.name} | Stage ${c.current_stage} | Interest: ${Number(c.interest_scale).toFixed(1)}/10` +
        ` | Product: ${(c as any).product ?? "unspecified"}` +
        `${days != null ? ` | Last contact: ${days}d ago` : ""}`
      );
    }
  }

  // ── Stale clients ─────────────────────────────────────────────────────────
  lines.push("\n=== STALE CLIENTS (no activity in 14+ days) ===");
  if (a.staleClients.length === 0) {
    lines.push("  None — all active clients have recent activity.");
  } else {
    for (const c of a.staleClients.slice(0, 10)) {
      const days = (c as any).daysSinceActivity;
      lines.push(
        `  • ${c.name} | Stage ${c.current_stage} | Product: ${(c as any).product ?? "unspecified"}` +
        `${days != null ? ` | Last contact: ${days}d ago` : ""}`
      );
    }
    if (a.staleClients.length > 10) lines.push(`  ... and ${a.staleClients.length - 10} more`);
  }

  // ── Top performers ────────────────────────────────────────────────────────
  lines.push("\n=== TOP CLOSERS (by won clients — who pushed the deal over the line) ===");
  if (a.topUsers.length === 0) {
    lines.push("  No wins recorded yet.");
  } else {
    for (const u of a.topUsers) {
      lines.push(`  ${u.name}: ${u.wins} wins`);
    }
  }

  lines.push("\n=== TOP SOURCERS (by clients added — who brings in the most leads) ===");
  if (a.topSourcers.length === 0) {
    lines.push("  No clients added yet.");
  } else {
    for (const u of a.topSourcers) {
      lines.push(`  ${u.name}: ${u.added} clients added`);
    }
  }

  // ── Time series ───────────────────────────────────────────────────────────
  lines.push("\n=== CLIENT ACQUISITION TREND (last 8 weeks) ===");
  for (const b of a.timeseries) {
    lines.push(`  Week of ${b.label}: ${b.count} new clients`);
  }

  // ── Activity Metrics ─────────────────────────────────────────────────────
  lines.push("\n=== ACTIVITY METRICS (all rep outreach — stage updates + follow-up check-ins) ===");
  lines.push(`Total logged activities: ${a.activityMetrics.total} (${a.activityMetrics.totalStage} stage events + ${a.activityMetrics.totalFollowUp} follow-up check-ins)`);
  if (a.activityMetrics.total > 0) {
    lines.push("By method (combined):");
    for (const [type, count] of Object.entries(a.activityMetrics.byType).sort((x, y) => y[1] - x[1])) {
      const fromStage = a.activityMetrics.byTypeStage[type] ?? 0;
      const fromFollowUp = a.activityMetrics.byTypeFollowUp[type] ?? 0;
      lines.push(`  ${type}: ${count} (${fromStage} stage · ${fromFollowUp} follow-up)`);
    }
    lines.push("By rep (most active first):");
    for (const r of a.activityMetrics.byRep) {
      const breakdown = Object.entries(r.breakdown).sort((x, y) => y[1] - x[1])
        .map(([t, n]) => `${t}×${n}`).join(", ");
      lines.push(`  ${r.name}: ${r.total} total (${r.totalStage} stage · ${r.totalFollowUp} follow-up) — ${breakdown}`);
    }
    // 14-day trend
    const trend = a.activityMetrics.trend;
    if (trend && trend.length >= 14) {
      const last7 = trend.slice(7).reduce((s, d) => s + d.count, 0);
      const prev7 = trend.slice(0, 7).reduce((s, d) => s + d.count, 0);
      const last7fu = trend.slice(7).reduce((s, d) => s + d.followup, 0);
      const trendLabel = last7 > prev7 ? "↑ accelerating" : last7 < prev7 ? "↓ slowing" : "→ flat";
      lines.push(`14-day activity trend: last 7d = ${last7} (${last7fu} follow-ups) vs prior 7d = ${prev7} (${trendLabel})`);
    }
  }

  // ── Follow-up Coverage ────────────────────────────────────────────────────
  lines.push("\n=== FOLLOW-UP COVERAGE (non-won clients) ===");
  const fc = a.followUpCoverage;
  lines.push(`Total non-won clients: ${fc.total}`);
  lines.push(`With active follow-up scheduled: ${fc.withActiveFollowUp} (${fc.coverageRate != null ? (fc.coverageRate * 100).toFixed(1) + "%" : "n/a"} coverage rate)`);
  lines.push(`Followed up within last 14 days: ${fc.withRecentLog}`);
  lines.push(`Never followed up: ${fc.neverFollowedUp}`);
  lines.push("Coverage by stage (active clients):");
  for (const s of fc.byStage) {
    lines.push(`  Stage ${s.stage}: ${s.withFollowUp} of ${s.total} have active follow-up (${s.rate != null ? (s.rate * 100).toFixed(1) + "%" : "n/a"})`);
  }

  // ── Deal Stage Conversion Rates ───────────────────────────────────────────
  lines.push("\n=== DEAL STAGE CONVERSION RATES ===");
  lines.push("Stage-to-next-stage progression (true funnel drop-off):");
  for (const s of a.stageConversionRates.progression) {
    lines.push(`  ${s.label}: ${(s.rate * 100).toFixed(1)}% (${s.numerator} of ${s.denominator} clients progressed)`);
  }
  lines.push("Cumulative win rate by entry stage (of clients that reached Stage N, % eventually won):");
  for (const s of a.stageConversionRates.cumulative) {
    lines.push(`  ${s.label}: ${(s.rate * 100).toFixed(1)}% (${s.numerator} of ${s.denominator} clients eventually won)`);
  }

  // ── Follow-ups ────────────────────────────────────────────────────────────
  if (followUps && followUps.length > 0) {
    lines.push("\n=== ACTIVE FOLLOW-UPS (prioritise in follow-up advice) ===");
    for (const f of followUps) {
      const c = f.clients;
      const overdue = new Date(f.next_reminder) < new Date();
      const interest = c?.interest_scale != null ? Number(c.interest_scale) : null;
      const interestLabel =
        interest == null ? "unknown" :
        interest >= 9 ? "High-Priority" :
        interest >= 7 ? "Committed" :
        interest >= 5 ? "Engaged" :
        interest >= 3 ? "Exploring" : "Unqualified";
      const status = overdue ? "[OVERDUE]" : `due ${new Date(f.next_reminder).toLocaleDateString()}`;
      lines.push(
        `  • ${c?.name ?? "Unknown"} | Stage ${c?.current_stage ?? "?"} | ` +
        `Interest: ${interest != null ? `${interest.toFixed(1)}/10 (${interestLabel})` : "not set"} | ` +
        `Product: ${c?.product ?? "unspecified"} | ` +
        `Follow-up: ${f.frequency.replace(/_/g, " ")} ${status}` +
        `${f.note ? ` | Note: "${f.note}"` : ""}` +
        `${c?.stage_notes ? ` | Last update: "${c.stage_notes}"` : ""}`
      );
    }
  } else {
    lines.push("\n=== ACTIVE FOLLOW-UPS ===");
    lines.push("  No active follow-ups scheduled.");
  }

  return lines.join("\n") + (userName ? `\n\n=== REPORT AUTHOR ===\n${userName}` : "");
}

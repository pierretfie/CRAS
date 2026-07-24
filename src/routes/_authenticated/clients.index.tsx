import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataScope } from "@/contexts/data-scope-context";
import { DataScopeToggle } from "@/components/data-scope-toggle";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsList,
});

function ClientsList() {
  const { effectiveUserId } = useDataScope();
  const { data: me } = useCurrentUser();
  const companyId = me?.company?.id;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "won" | "lost">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["clients", "v2", effectiveUserId, companyId],
    queryFn: async () => {
      if (!companyId) return [];

      if (!effectiveUserId) {
        // "All Data" mode - scoped to company
        const sql = `SELECT c.*, p.name AS created_by_name, p.department AS created_by_dept
           FROM clients c
           LEFT JOIN profiles p ON p.id = c.created_by
           WHERE c.company_id = $1
           ORDER BY c.updated_at DESC`;
        const res = await query(sql, [companyId]);
        if (res.error) throw res.error;
        return res.data;
      }

      // "Your Data" mode - scoped to company + user
      const clientIdsSql = `
        SELECT DISTINCT client_id FROM (
          SELECT id as client_id FROM clients WHERE created_by = $1 AND company_id = $2
          UNION
          SELECT e.client_id FROM client_stage_events e JOIN clients c ON c.id = e.client_id WHERE e.user_id = $1 AND c.company_id = $2
          UNION
          SELECT f.client_id FROM client_follow_ups f JOIN clients c ON c.id = f.client_id WHERE f.user_id = $1 AND c.company_id = $2
          UNION
          SELECT l.client_id FROM follow_up_logs l JOIN clients c ON c.id = l.client_id WHERE l.user_id = $1 AND c.company_id = $2
        ) AS user_clients
      `;

      const clientIdsRes = await query(clientIdsSql, [effectiveUserId, companyId]);
      if (clientIdsRes.error) throw clientIdsRes.error;

      const clientIds = ((clientIdsRes.data ?? []) as Array<{ client_id: string }>).map(row => row.client_id);

      if (clientIds.length === 0) {
        return [];
      }

      const sql = `SELECT c.*, p.name AS created_by_name, p.department AS created_by_dept
         FROM clients c
         LEFT JOIN profiles p ON p.id = c.created_by
         WHERE c.id = ANY($1::uuid[]) AND c.company_id = $2
         ORDER BY c.updated_at DESC`;

      const res = await query(sql, [clientIds, companyId]);
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!companyId,
  });

  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const [productFilter, setProductFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");

  // Build unique rep list from loaded clients
  const reps = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of (data ?? []) as any[]) {
      if (c.created_by && c.created_by_name) seen.set(c.created_by, c.created_by_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filtered = (data ?? []).filter((c: any) => {
    if (status !== "all" && c.status !== status) return false;
    if (repFilter !== "all" && c.created_by !== repFilter) return false;
    if (productFilter !== "all") {
      if (productFilter === "__unspecified__") {
        if (c.product != null) return false;
      } else if (c.product !== productFilter) {
        return false;
      }
    }
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(t) ||
      c.category.toLowerCase().includes(t) ||
      c.mode_of_connection.toLowerCase().includes(t) ||
      (c.contact_person ?? "").toLowerCase().includes(t) ||
      (c.created_by_name ?? "").toLowerCase().includes(t)
    );
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} total</p>
        </div>
        <div className="flex items-center gap-2">
          <DataScopeToggle />
          <Button asChild>
            <Link to="/clients/new"><PlusCircle className="h-4 w-4 mr-2" />New Client</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={productFilter} onValueChange={(v) => setProductFilter(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All products" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            <SelectItem value="__unspecified__">Unspecified</SelectItem>
            {products?.map((p: { id: string; name: string }) => (
              <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {reps.length > 1 && (
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="All reps" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reps</SelectItem>
              {reps.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No clients yet. Add your first.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((c: any) => {
            const contactParts = [c.contact_person, c.contact_person_role].filter(Boolean);
            const contactLabel = contactParts.length > 0 ? `· ${contactParts.join(" — ")}` : "";
            return (
            <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="block">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.category} · {c.mode_of_connection} {c.contact_person ? `· ${c.contact_person}` : ""}
                    </div>
                    {c.created_by_name && (
                      <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
                        Added by <span className="text-primary font-medium">{c.created_by_name}</span>
                        {c.created_by_dept ? <span> · {c.created_by_dept}</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={
                      c.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
                      c.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
                      c.current_stage === 3 ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
                      ""
                    }>Stage {c.current_stage}</Badge>
                    <Badge
                      variant={c.status === "lost" ? "destructive" : "secondary"}
                      className={c.status === "won" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                    >
                      {c.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
          })}
        </div>
      )}
    </div>
  );
}

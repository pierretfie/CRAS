import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsList,
});

function ClientsList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "won" | "lost">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await query('SELECT * FROM clients ORDER BY updated_at DESC');
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const filtered = (data ?? []).filter((c: any) => {
    if (status !== "all" && c.status !== status) return false;
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return c.name.toLowerCase().includes(t) || c.category.toLowerCase().includes(t) || c.mode_of_connection.toLowerCase().includes(t) || (c.contact_person ?? "").toLowerCase().includes(t);
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} total</p>
        </div>
        <Button asChild>
          <Link to="/clients/new"><PlusCircle className="h-4 w-4 mr-2" />New Client</Link>
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
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
                      {c.category} · {c.mode_of_connection} {contactLabel}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={
                      c.current_stage === 1 ? "border-stage-1/30 text-stage-1 bg-stage-1/10" :
                      c.current_stage === 2 ? "border-stage-2/30 text-stage-2 bg-stage-2/10" :
                      c.current_stage === 3 ? "border-stage-3/30 text-stage-3 bg-stage-3/10" :
                      ""
                    }>Stage {c.current_stage}</Badge>
                    <Badge
                      variant={c.status === "won" ? "default" : c.status === "lost" ? "destructive" : "secondary"}
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

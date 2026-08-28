import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { query } from "@/lib/db";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Search, ArrowLeft } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DatePicker } from "@/components/ui/date-picker";

export const Route = createFileRoute("/_authenticated/categories/$id")({
  component: CategoryPage,
});

function CategoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: me } = useCurrentUser();
  const companyId = me?.company?.id;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "won" | "lost">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: category, isLoading: categoryLoading } = useQuery({
    queryKey: ["admin_category", id],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_categories WHERE id = $1', [id]);
      if (res.error) throw res.error;
      return res.data?.[0] as { id: string; name: string } | undefined;
    },
    enabled: !!id,
  });

  const categoryName = category?.name;

  const { data, isLoading } = useQuery({
    queryKey: ["clients", "category", id, companyId, categoryName],
    queryFn: async () => {
      if (!companyId || !categoryName) return [];
      const sql = `SELECT c.*, p.name AS created_by_name, p.department AS created_by_dept
         FROM clients c
         LEFT JOIN profiles p ON p.id = c.created_by
         WHERE c.company_id = $1 AND c.category = $2 AND c.parent_client_id IS NULL
         ORDER BY c.updated_at DESC`;
      const res = await query(sql, [companyId, categoryName]);
      if (res.error) throw res.error;
      return res.data;
    },
    enabled: !!companyId && !!categoryName,
  });

  const filtered = (data ?? []).filter((c: any) => {
    if (status !== "all" && c.status !== status) return false;
    if (dateFrom) {
      if (new Date(c.created_at) < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(c.created_at) > to) return false;
    }
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(t) ||
      c.mode_of_connection.toLowerCase().includes(t) ||
      (c.contact_person ?? "").toLowerCase().includes(t) ||
      (c.created_by_name ?? "").toLowerCase().includes(t)
    );
  }).sort((a: any, b: any) => {
    if (sortBy === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: -1 as any })}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{categoryLoading ? "Loading…" : categoryName}</h1>
            <p className="text-sm text-muted-foreground">{categoryLoading ? "" : `${data?.length ?? 0} clients in this category`}</p>
          </div>
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
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sort by" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="From" />
        <DatePicker value={dateTo} onChange={setDateTo} placeholder="To" />
      </div>

      {categoryLoading || isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No clients in this category yet.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((c: any) => (
            <Link key={c.id} to="/clients/$id" params={{ id: c.id }} className="block">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.mode_of_connection} {c.contact_person ? `· ${c.contact_person}` : ""}
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
          ))}
        </div>
      )}
    </div>
  );
}

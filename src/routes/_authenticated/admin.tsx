import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Send, Bot, User, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { Markdown } from "@/components/markdown";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: me, isLoading } = useCurrentUser();

  if (isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (!me?.isAdmin) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 text-center space-y-2">
          <ShieldAlert className="h-10 w-10 text-primary mx-auto" />
          <p className="font-semibold">Admin only</p>
          <p className="text-sm text-muted-foreground">You don't have admin access.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage workspace configuration</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="grid grid-cols-5 max-w-xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="console">AI Console</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="stages"><StagesTab /></TabsContent>
        <TabsContent value="console"><ConsoleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data: users, refetch } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        query('SELECT * FROM profiles ORDER BY created_at DESC'),
        query('SELECT * FROM user_roles'),
      ]);
      if (!profiles) return [];
      const roleMap = new Map<string, string[]>();
      for (const r of (roles ?? []) as { user_id: string; role: string }[]) {
        const cur = roleMap.get(r.user_id) ?? [];
        cur.push(r.role);
        roleMap.set(r.user_id, cur);
      }
      return (profiles as any[]).map((p) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    },
  });

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", department: "", role: "user" as "admin" | "user" });
  const [creating, setCreating] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ email: string; generatedPassword: string } | null>(null);

  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.email.trim()) return toast.error("Name and email required");
    setCreating(true);
    try {
      const { adminCreateUser } = await import("@/lib/api/admin.functions");
      const result = await adminCreateUser({
        data: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          department: createForm.department.trim() || undefined,
          role: createForm.role,
        },
      });
      setCreatedResult({ email: result.email, generatedPassword: result.generatedPassword });
      setCreateForm({ name: "", email: "", department: "", role: "user" });
      toast.success("User created");
      refetch();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Workspace Users</CardTitle>
            <CardDescription>Create users and manage roles</CardDescription>
          </div>
          <Button size="sm" onClick={() => { setShowCreate(!showCreate); setCreatedResult(null); }}>
            <Plus className="h-4 w-4 mr-1" />{showCreate ? "Cancel" : "Create User"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Created user credentials display */}
        {createdResult && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <ShieldAlert className="h-4 w-4" />
              User Created — Share These Credentials
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-mono font-medium">{createdResult.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Password:</span>{" "}
                <span className="font-mono font-medium">{createdResult.generatedPassword}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The user will be prompted to change this password on first login.</p>
            <Button size="sm" variant="outline" onClick={() => setCreatedResult(null)}>Dismiss</Button>
          </div>
        )}

        {/* Create user form */}
        {showCreate && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="John Doe" />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="john@company.com" />
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Input value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })} placeholder="Sales / BD / Marketing" />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={createForm.role} onValueChange={(v) => setCreateForm({ ...createForm, role: v as "admin" | "user" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">A random password will be generated. Share it with the user — they'll be asked to change it on first login.</p>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creating…" : "Create User"}</Button>
          </div>
        )}

        {/* User list */}
        <div className="space-y-2">
          {users?.map((u: any) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {u.name}
                  {u.roles?.includes("admin") && <Badge variant="default" className="text-xs">Admin</Badge>}
                  {!u.active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{u.email} · {u.department ?? "—"}</div>
              </div>
              <div className="flex gap-1">
                {!u.roles?.includes("admin") && (
                  <Button size="sm" variant="outline" onClick={async () => {
                    try {
                      const res = await query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [u.id, 'admin']);
                      if (res.error) throw res.error;
                      toast.success("Promoted to admin");
                      refetch();
                    } catch (err: any) {
                      console.error(err);
                      toast.error(err.message ?? "Failed to promote");
                    }
                  }}>
                    Promote
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={u.active ? "ghost" : "outline"}
                  onClick={async () => {
                    try {
                      const { adminToggleUserActive } = await import("@/lib/api/admin.functions");
                      await adminToggleUserActive({ data: { userId: u.id, active: !u.active } });
                      toast.success(u.active ? "User deactivated" : "User activated");
                      refetch();
                    } catch (err: any) {
                      console.error(err);
                      toast.error(err.message ?? "Failed to update user");
                    }
                  }}
                >
                  {u.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
          {!users?.length && <p className="text-sm text-muted-foreground">No users yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}


function CategoriesTab() {
  const qc = useQueryClient();
  const { data: cats } = useQuery({
    queryKey: ["admin_categories"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_categories ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    try {
      const res = await query('INSERT INTO admin_categories (name) VALUES ($1)', [name.trim()]);
      if (res.error) throw res.error;
      setName("");
      qc.invalidateQueries({ queryKey: ["admin_categories"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to add category");
    }
  }

  async function del(id: string) {
    try {
      const res = await query('DELETE FROM admin_categories WHERE id = $1', [id]);
      if (res.error) throw res.error;
      qc.invalidateQueries({ queryKey: ["admin_categories"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to delete category");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Client Categories</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <div className="space-y-1">
          {cats?.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between border-b border-border pb-1">
              <span>{c.name}</span>
              <Button size="icon" variant="ghost" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductsTab() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("admin_products").select("*").order("name")).data ?? [],
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("admin_products").insert({ name: name.trim() });
    if (error) toast.error(error.message);
    else { setName(""); qc.invalidateQueries({ queryKey: ["admin_products"] }); }
  }
  async function del(id: string) {
    const { error } = await supabase.from("admin_products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin_products"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client Products</CardTitle>
        <CardDescription>Curated list — selectable when creating or editing a client</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="New product" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <div className="space-y-1">
          {products?.map((p: { id: string; name: string }) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border pb-1">
              <span>{p.name}</span>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {products && products.length === 0 && (
            <p className="text-sm text-muted-foreground">No products yet — add one above</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StagesTab() {
  const qc = useQueryClient();
  const { data: stages } = useQuery({
    queryKey: ["stage_config"],
    queryFn: async () => {
      const res = await query('SELECT * FROM conversion_stage_config ORDER BY stage_number');
      if (res.error) throw res.error;
      return res.data;
    },
  });

  async function update(id: string, patch: Partial<{ label: string; description: string }>) {
    try {
      let setClause = '';
      const values: any[] = [];
      if (patch.label !== undefined) {
        setClause += 'label = $' + (values.length + 1);
        values.push(patch.label);
      }
      if (patch.description !== undefined) {
        if (setClause) setClause += ', ';
        setClause += 'description = $' + (values.length + 1);
        values.push(patch.description);
      }
      if (setClause === '') return; // nothing to update
      const res = await query(`UPDATE conversion_stage_config SET ${setClause} WHERE id = $${values.length + 1}`, [...values, id]);
      if (res.error) throw res.error;
      qc.invalidateQueries({ queryKey: ["stage_config"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to update stage");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Conversion Stages</CardTitle><CardDescription>Edit labels and descriptions</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {stages?.map((s: any) => (
          <div key={s.id} className="space-y-2 p-3 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Stage {s.stage_number}</Badge>
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input defaultValue={s.label} onBlur={(e) => update(s.id, { label: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea defaultValue={s.description ?? ""} onBlur={(e) => update(s.id, { description: e.target.value })} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface Msg { id: string; role: "user" | "assistant"; content: string }

function ConsoleTab() {
  const { data: analytics } = useAnalyticsData();
  const [messages, setMessages] = useState<Msg[]>([
    { id: "i", role: "assistant", content: "Admin console. Ask anything about the workspace — funnel, channels, stale clients, top performers." },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [messages]);

  async function send() {
    if (!input.trim() || streaming || !analytics) return;
    const u: Msg = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    const a: Msg = { id: crypto.randomUUID(), role: "assistant", content: "" };
    setMessages((m) => [...m, u, a]);
    setInput("");
    setStreaming(true);
    try {
      // Try real AI first
      const { aiChatComplete } = await import("@/lib/api/ai.functions");
      const analyticsContext = `Total clients: ${analytics.total}\nConversion rate: ${(analytics.conversion * 100).toFixed(1)}%\nActive: ${analytics.active}, Won: ${analytics.won}, Lost: ${analytics.lost}\nStale clients (30+ days no activity): ${analytics.stale}\nTop channels: ${Object.entries(analytics.byMode).map(([k, v]) => `${k}: ${v}`).join(", ")}\nCategories: ${Object.entries(analytics.byCategory).map(([k, v]) => `${k}: ${v}`).join(", ")}\nBest converting category: ${analytics.bestCategory ?? "n/a"}\nTop performers: ${analytics.topUsers.map((u) => `${u.name}: ${u.wins} wins`).join(", ") || "none yet"}`;
      const result = await aiChatComplete({
        data: {
          messages: [...messages, u].filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content })),
          analyticsContext,
        },
      });
      setMessages((prev) => {
        const c = [...prev];
        c[c.length - 1] = { ...c[c.length - 1], content: result.content };
        return c;
      });
    } catch (e: any) {
      toast.error(e.message || "AI error");
      console.error(e);
      // Remove the empty assistant bubble on failure
      setMessages((prev) => prev.slice(0, -1));
    } finally { setStreaming(false); }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>AI Console</CardTitle>
            <CardDescription>Streamed responses, grounded in live analytics</CardDescription>
          </div>
          {messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setMessages([
                  {
                    id: "i",
                    role: "assistant",
                    content:
                      "Admin console. Ask anything about the workspace — funnel, channels, stale clients, top performers.",
                  },
                ])
              }
              className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="h-80 overflow-y-auto space-y-3 mb-3 pr-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div>}
              <div className={`max-w-[80%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.content ? <Markdown content={m.content} /> : "…"}
              </div>
              {m.role === "user" && <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center"><User className="h-4 w-4" /></div>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Ask..." className="resize-none" />
          <Button onClick={send} disabled={streaming || !input.trim()} className="self-end"><Send className="h-4 w-4" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

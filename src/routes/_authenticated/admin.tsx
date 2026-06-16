import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Send, Bot, User, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { mockChat } from "@/lib/ai-mock";

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
        <TabsList className="grid grid-cols-4 max-w-xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="console">AI Console</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="stages"><StagesTab /></TabsContent>
        <TabsContent value="console"><ConsoleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { data: users, refetch } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace users</CardTitle>
        <CardDescription>To add a user, share the signup link. They sign up themselves; you can later promote.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email} · {u.department ?? "—"}</div>
              </div>
              <Button size="sm" variant="outline" onClick={async () => {
                const { error } = await supabase.from("user_roles").insert({ user_id: u.id, role: "admin" });
                if (error) toast.error(error.message); else { toast.success("Promoted to admin"); refetch(); }
              }}>
                Promote to Admin
              </Button>
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
    queryFn: async () => (await supabase.from("admin_categories").select("*").order("name")).data ?? [],
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("admin_categories").insert({ name: name.trim() });
    if (error) toast.error(error.message);
    else { setName(""); qc.invalidateQueries({ queryKey: ["admin_categories"] }); }
  }
  async function del(id: string) {
    await supabase.from("admin_categories").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin_categories"] });
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
          {cats?.map((c) => (
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

function StagesTab() {
  const qc = useQueryClient();
  const { data: stages } = useQuery({
    queryKey: ["stage_config"],
    queryFn: async () => (await supabase.from("conversion_stage_config").select("*").order("stage_number")).data ?? [],
  });

  async function update(id: string, patch: Partial<{ label: string; description: string }>) {
    await supabase.from("conversion_stage_config").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["stage_config"] });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Conversion Stages</CardTitle><CardDescription>Edit labels and descriptions</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {stages?.map((s) => (
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
      const stream = mockChat([...messages, u].map((m) => ({ role: m.role, content: m.content })), analytics as unknown as Record<string, unknown>);
      for await (const chunk of stream) {
        setMessages((prev) => {
          const c = [...prev];
          c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + chunk };
          return c;
        });
      }
    } finally { setStreaming(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>AI Console</CardTitle><CardDescription>Streamed responses, grounded in live analytics</CardDescription></CardHeader>
      <CardContent>
        <div ref={ref} className="h-80 overflow-y-auto space-y-3 mb-3 pr-2">
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div>}
              <div className={`max-w-[80%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.content || "…"}</div>
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Fragment, useState, useEffect, useRef, memo } from "react";

/** Auto-scrolling container for streaming reasoning text. */
const ReasoningScrollArea = memo(function ReasoningScrollArea({ text }: { text: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = el.current.scrollHeight;
  }, [text]);
  return (
    <div
      ref={el}
      className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto"
    >
      {text}
    </div>
  );
});

/** Regenerate button — pill label slides in, auto-collapses after 10 s, re-expands on hover */
const RegenerateButton = memo(function RegenerateButton({ onClick }: { onClick: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setExpanded(false), 10000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const showLabel = expanded || hovered;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-1.5 rounded-full border border-muted-foreground/20 bg-background/70 backdrop-blur-sm px-2 py-1 text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 hover:bg-muted/60 transition-all duration-300 cursor-pointer"
      style={{ opacity: hovered ? 1 : 0.7 }}
    >
      <RotateCcw className="h-3 w-3 shrink-0" />
      <span
        className="overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-500 ease-in-out"
        style={{ maxWidth: showLabel ? "260px" : "0px", opacity: showLabel ? 1 : 0 }}
      >
        {hovered && !expanded ? "… regenerate response" : "Not the response you wanted?"}
      </span>
    </button>
  );
});
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Send, Bot, User, ShieldAlert, Loader2, FileText, Copy, Square, Pencil, ShieldCheck, ShieldOff, RotateCcw, Brain, ChevronDown, ChevronRight, Building2, Globe, Phone, MapPin, Briefcase, Save } from "lucide-react";
import { toast } from "sonner";
import { useAnalyticsData } from "@/hooks/use-analytics-data";
import { Markdown } from "@/components/markdown";
import { compileLatexToPdf } from "@/lib/api/ai.functions";
import { buildAnalyticsContext } from "@/lib/ai-context";
import type { ThinkingLevel } from "@/lib/ai-nvidia.server";
import { PdfProcessCard } from "@/components/pdf-process-card";
import type { PdfState } from "@/components/pdf-process-card";

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
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage workspace configuration</p>
      </div>
      <Tabs defaultValue="users">
        <TabsList className="grid grid-cols-6 max-w-2xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="console">AI Console</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><div className="max-w-4xl"><UsersTab /></div></TabsContent>
        <TabsContent value="categories"><div className="max-w-2xl"><CategoriesTab /></div></TabsContent>
        <TabsContent value="products"><div className="max-w-2xl"><ProductsTab /></div></TabsContent>
        <TabsContent value="stages"><div className="max-w-2xl"><StagesTab /></div></TabsContent>
        <TabsContent value="company"><div className="max-w-2xl"><CompanyTab /></div></TabsContent>
        <TabsContent value="console"><ConsoleTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
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
    if (!me?.profile?.company_id) return toast.error("Company not found — cannot create user");
    setCreating(true);
    try {
      const { adminCreateUserInCompany } = await import("@/lib/api/admin.functions");
      const result = await adminCreateUserInCompany({
        data: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          department: createForm.department.trim() || undefined,
          role: createForm.role,
          companyId: me.profile.company_id,
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
            <UserRow key={u.id} u={u} isSelf={u.id === me?.user?.id} onRefetch={refetch} />
          ))}
          {!users?.length && <p className="text-sm text-muted-foreground">No users yet.</p>}
        </div>
      </CardContent>
    </Card>
  );
}


function UserRow({ u, isSelf, onRefetch }: { u: any; isSelf: boolean; onRefetch: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: u.name, email: u.email ?? "", department: u.department ?? "" });
  const [saving, setSaving] = useState(false);

  const isAdmin = u.roles?.includes("admin");

  async function saveEdit() {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.email.trim()) return toast.error("Email is required");
    setSaving(true);
    try {
      // Update profile (name + department)
      const res = await query(
        'UPDATE profiles SET name = $1, department = $2 WHERE id = $3',
        [form.name.trim(), form.department.trim() || null, u.id]
      );
      if (res.error) throw res.error;

      // Update email via admin API if it changed
      if (form.email.trim().toLowerCase() !== (u.email ?? "").toLowerCase()) {
        const { adminUpdateUserEmail } = await import("@/lib/api/admin.functions");
        await adminUpdateUserEmail({ data: { userId: u.id, email: form.email.trim() } });
      }

      toast.success("User updated");
      setEditing(false);
      onRefetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRole() {
    try {
      if (isAdmin) {
        const res = await query(
          'DELETE FROM user_roles WHERE user_id = $1 AND role = $2',
          [u.id, 'admin']
        );
        if (res.error) throw res.error;
        toast.success(`${u.name} demoted to user`);
      } else {
        const res = await query(
          'INSERT INTO user_roles (user_id, role) VALUES ($1, $2)',
          [u.id, 'admin']
        );
        if (res.error) throw res.error;
        toast.success(`${u.name} promoted to admin`);
      }
      onRefetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    }
  }

  async function toggleActive() {
    try {
      const { adminToggleUserActive } = await import("@/lib/api/admin.functions");
      await adminToggleUserActive({ data: { userId: u.id, active: !u.active } });
      toast.success(u.active ? "User deactivated" : "User activated");
      onRefetch();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update user");
    }
  }

  return (
    <div className="border-b border-border pb-3 last:border-0 space-y-2">
      {/* Display row */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap">
            {u.name}
            {isAdmin && <Badge variant="default" className="text-xs">Admin</Badge>}
            {isSelf && <Badge variant="outline" className="text-xs text-muted-foreground">You</Badge>}
            {!u.active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {u.email}{u.department ? ` · ${u.department}` : ""}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {/* Edit */}
          <Button
            size="sm" variant="ghost"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => { setForm({ name: u.name, email: u.email ?? "", department: u.department ?? "" }); setEditing(!editing); }}
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          {/* Promote / Demote — hidden for self */}
          {!isSelf && (
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-2 text-xs gap-1 ${isAdmin ? "text-amber-400 hover:text-destructive" : "text-muted-foreground hover:text-primary"}`}
              onClick={toggleRole}
              title={isAdmin ? "Demote to user" : "Promote to admin"}
            >
              {isAdmin
                ? <><ShieldOff className="h-3 w-3" /> Demote</>
                : <><ShieldCheck className="h-3 w-3" /> Promote</>}
            </Button>
          )}
          {/* Activate / Deactivate — hidden for self */}
          {!isSelf && (
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-2 text-xs gap-1 ${u.active ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-stage-3"}`}
              onClick={toggleActive}
            >
              {u.active ? "Deactivate" : "Activate"}
            </Button>
          )}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Full Name</Label>
              <Input
                className="h-8 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                className="h-8 text-sm"
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Department</Label>
              <Input
                className="h-8 text-sm"
                placeholder="Sales / BD / Marketing"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyTab() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    industry: "",
    website: "",
    phone: "",
    address: "",
  });
  const [loaded, setLoaded] = useState(false);

  // Populate form from current user's company
  useEffect(() => {
    if (me?.company && !loaded) {
      setForm({
        name: me.company.name ?? "",
        industry: me.company.industry ?? "",
        website: me.company.website ?? "",
        phone: me.company.phone ?? "",
        address: me.company.address ?? "",
      });
      setLoaded(true);
    }
  }, [me?.company, loaded]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Company name is required");
    if (!me?.profile?.company_id) return toast.error("No company linked to your account");
    setSaving(true);
    try {
      const { updateCompany } = await import("@/lib/api/admin.functions");
      await updateCompany({
        data: {
          companyId: me.profile.company_id,
          name: form.name.trim(),
          industry: form.industry.trim() || undefined,
          website: form.website.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim() || undefined,
        },
      });
      toast.success("Company details updated");
      qc.invalidateQueries({ queryKey: ["current-user"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update company");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>Edit your company's profile. Changes are reflected across the workspace.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="co-name" className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              Company Name *
            </Label>
            <Input
              id="co-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Acme Corp"
              required
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="co-industry" className="flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                Industry
              </Label>
              <Input
                id="co-industry"
                value={form.industry}
                onChange={(e) => set("industry", e.target.value)}
                placeholder="e.g. SaaS, Finance, Healthcare"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                Phone
              </Label>
              <Input
                id="co-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 000 0000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="co-website" className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Website
            </Label>
            <Input
              id="co-website"
              type="url"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://yourcompany.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="co-address" className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              Address
            </Label>
            <Input
              id="co-address"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="123 Main St, City, Country"
            />
          </div>

          {/* Read-only info */}
          {me?.company && (
            <div className="rounded-md bg-muted/40 border border-border px-4 py-3 space-y-1 text-sm">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">Read-only</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company ID</span>
                <span className="font-mono text-xs">{me.profile?.company_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-mono text-xs">{me.company.slug}</span>
              </div>
            </div>
          )}

          <Button type="submit" disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </form>
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
  const { data: me } = useCurrentUser();
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => (await supabase.from("admin_products").select("*").order("name")).data ?? [],
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    const companyId = me?.profile?.company_id;
    if (!companyId) return toast.error("Company not found — cannot add product");
    const { error } = await supabase.from("admin_products").insert({ name: name.trim(), company_id: companyId });
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

  const [draft, setDraft] = useState<Record<string, { label: string; description: string }>>({});

  function updateDraft(id: string, field: "label" | "description", value: string) {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? { label: stages?.find((s: any) => s.id === id)?.label ?? "", description: stages?.find((s: any) => s.id === id)?.description ?? "" }),
        [field]: value,
      },
    }));
  }

  async function saveAll() {
    try {
      for (const [id, patch] of Object.entries(draft)) {
        let setClause = "";
        const values: any[] = [];
        if (patch.label !== undefined) {
          setClause += "label = $" + (values.length + 1);
          values.push(patch.label);
        }
        if (patch.description !== undefined) {
          if (setClause) setClause += ", ";
          setClause += "description = $" + (values.length + 1);
          values.push(patch.description);
        }
        if (setClause === "") continue;
        const res = await query(`UPDATE conversion_stage_config SET ${setClause} WHERE id = $${values.length + 1}`, [...values, id]);
        if (res.error) throw res.error;
      }
      setDraft({});
      qc.invalidateQueries({ queryKey: ["stage_config"] });
      toast.success("Stages updated successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to update stages");
    }
  }

  const hasChanges = Object.keys(draft).length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Conversion Stages</CardTitle>
          <CardDescription>Edit labels and descriptions</CardDescription>
        </div>
        {hasChanges && (
          <Button size="sm" onClick={saveAll}>
            Save Changes
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {stages?.map((s: any) => (
          <div key={s.id} className="space-y-2 p-3 border border-border rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Stage {s.stage_number}</Badge>
              {draft[s.id] && <Badge variant="secondary" className="text-xs">Unsaved</Badge>}
            </div>
            <div className="space-y-1">
              <Label>Label</Label>
              <Input
                defaultValue={s.label}
                onChange={(e) => updateDraft(s.id, "label", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                defaultValue={s.description ?? ""}
                onChange={(e) => updateDraft(s.id, "description", e.target.value)}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface Msg { id: string; role: "user" | "assistant"; content: string; thinking?: string; pdfState?: PdfState; pdfError?: string; precompiledPdf?: string; pdfFilename?: string }

function extractLatex(text: string): string {
  const startMarker = "%%LATEX_START%%";
  const endMarker = "%%LATEX_END%%";
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx + startMarker.length, endIdx).replace(/^\n/, "").trim();
  }
  const fenceMatch = text.match(/```(?:latex)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text;
}

function splitMessage(text: string): { visible: string; latex: string | null; filename: string } {
  // Match either %%FILENAME%%value%% (closed) or %%FILENAME%%value\n (AI streams without closing %%)
  const fileMatch = text.match(/%%FILENAME%%(.*?)(?:%%|\n|$)/);
  const rawFilename = fileMatch ? fileMatch[1].trim() : "report";
  const filename = rawFilename.replace(/^%%FILENAME%%/i, "").trim() || "report";

  // Use indexOf-based extraction instead of regex for large LaTeX bodies —
  // non-greedy [\s\S]*? can silently fail or truncate on large documents.
  const startMarker = "%%LATEX_START%%";
  const endMarker = "%%LATEX_END%%";
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const rawLatex = text.slice(startIdx + startMarker.length, endIdx);
    const latex = rawLatex.replace(/^\n/, "").replace(/\n$/, "").trim();
    let visible = text.slice(0, startIdx);
    // Remove %%FILENAME%%...%% from the visible part
    visible = visible.replace(/%%FILENAME%%[^%]*%%/g, "").replace(/%%[^%\n]*%%?/g, "").trim();
    return { visible, latex: latex || null, filename };
  }

  // Fallback: fenced code block
  const fenceMatch = text.match(/(.*?)```(?:latex)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    return { visible: fenceMatch[1].trim(), latex: fenceMatch[2].trim(), filename };
  }
  const visible = text.replace(/%%FILENAME%%[^%]*%%/g, "").replace(/%%[A-Z_]+%%/g, "").trim();
  return { visible, latex: null, filename };
}

function ConsoleTab() {
  const { data: analytics } = useAnalyticsData();
  const { data: me } = useCurrentUser();
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem("admin-ai-chat-history");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [{ id: "i", role: "assistant", content: "Admin console. Ask anything about the workspace — funnel, channels, stale clients, top performers." }];
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState<ThinkingLevel>("auto");
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  };

  const stopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  async function sendWithHistory(text: string, history: Msg[]) {
    const trimmed = text.trim();
    if (!trimmed || streaming || !analytics) return;
    const u: Msg = { id: crypto.randomUUID(), role: "user", content: trimmed };
    const assistantId = crypto.randomUUID();
    const a: Msg = { id: assistantId, role: "assistant", content: "" };
    setMessages([...history, u, a]);
    setInput("");
    setStreaming(true);
    isAtBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const analyticsContext = buildAnalyticsContext(analytics, undefined, me?.profile?.full_name ?? me?.user?.email ?? undefined);

      // Phase 1: stream conversational tokens via SSE
      let streamedText = "";
      let streamedThinking = "";
      let latexDetected = false;
      let latexFullText = "";
      let answerStarted = false;

      const res = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, u]
            .filter((m) => m.content !== "")
            .map((m) => ({ role: m.role, content: m.content })),
          analyticsContext,
          thinking,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "think_chunk") {
            const thinkText = event.text as string;
            streamedThinking += thinkText;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, thinking: streamedThinking } : m),
            );
            // Auto-open collapsible as reasoning streams in
            if (!answerStarted) {
              setExpandedThinking((prev) => new Set(prev).add(assistantId));
            }
          } else if (event.type === "chunk") {
            // First answer token — close the reasoning collapsible
            if (!answerStarted && streamedThinking) {
              setExpandedThinking((prev) => {
                const next = new Set(prev);
                next.delete(assistantId);
                return next;
              });
            }
            answerStarted = true;
            streamedText += event.text as string;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, content: streamedText } : m),
            );
          } else if (event.type === "latex_detected") {
            latexDetected = true;
            const visibleText = (event.visibleText as string) ?? streamedText;
            streamedText = visibleText;
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId
                ? { ...m, content: visibleText, pdfState: "generating" as PdfState }
                : m),
            );
          } else if (event.type === "latex_complete") {
            latexFullText = event.fullText as string;
            // Extract and store filename immediately so it's available on the Msg
            const { filename: extractedFilename } = splitMessage(latexFullText);
            setMessages((prev) =>
              prev.map((m) => m.id === assistantId ? { ...m, pdfFilename: extractedFilename } : m),
            );
          } else if (event.type === "post_latex_text") {
            const postText = (event.text as string).trim();
            if (postText) {
              streamedText = streamedText ? `${streamedText}\n\n${postText}` : postText;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantId ? { ...m, content: streamedText } : m),
              );
            }
          } else if (event.type === "done") {
            break outer;
          } else if (event.type === "error") {
            throw new Error((event.message as string) || "Stream error");
          }
        }
      }

      if (!latexDetected) {
        // Plain conversational response — done
        return;
      }

      // Stream is done — stop the spinner before the compile phase starts
      setStreaming(false);

      // Phase 2: Compile the LaTeX received silently in background
      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, pdfState: "processing" as PdfState } : m),
      );

      console.log("[PDF admin] latexFullText length:", latexFullText.length);

      const { latex: finalLatex, filename: extractedFilename } = splitMessage(latexFullText);

      if (!finalLatex) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "error" as PdfState, pdfError: "No LaTeX found in response. Try asking again." }
              : m,
          ),
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) => m.id === assistantId ? { ...m, pdfState: "compiling" as PdfState, pdfFilename: extractedFilename } : m),
      );

      try {
        const compiled = await compileLatexToPdf({ data: { latex: finalLatex } });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "ready" as PdfState, precompiledPdf: compiled.pdf, pdfFilename: extractedFilename }
              : m,
          ),
        );
      } catch (compileErr: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, pdfState: "error" as PdfState, pdfError: compileErr.message || "PDF compilation failed.", pdfFilename: extractedFilename }
              : m,
          ),
        );
      }
    } catch (e: any) {
      if (e?.name === "AbortError" || controller.signal.aborted) { setMessages(history); return; }
      toast.error(e.message || "AI error");
      console.error(e);
      setMessages((prev) => prev.slice(0, -2));
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }

  function handleRetry(msgId: string) {
    if (streaming) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const msg = messages[idx];
    if (msg.role === "user") {
      void sendWithHistory(msg.content, messages.slice(0, idx));
    } else {
      let userIdx = idx - 1;
      while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
      if (userIdx < 0) return;
      void sendWithHistory(messages[userIdx].content, messages.slice(0, userIdx));
    }
  }

  useEffect(() => {
    localStorage.setItem("admin-ai-chat-history", JSON.stringify(messages));
  }, [messages]);

  // ── Auto-scroll — sticky bottom, respects manual scroll-up ──────────────
  const isAtBottomRef = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(frame);
  }, [messages]);

  function send() {
    void sendWithHistory(input, messages);
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
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const initial: Msg[] = [{ id: "i", role: "assistant", content: "Admin console. Ask anything about the workspace — funnel, channels, stale clients, top performers." }];
                  setMessages(initial);
                  localStorage.removeItem("admin-ai-chat-history");
                }}
                className="text-muted-foreground hover:text-destructive cursor-pointer"
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="h-[calc(100vh-320px)] min-h-[480px] overflow-y-auto space-y-3 mb-3 pr-2">
          {messages.map((m) => {
            const { visible, latex, filename } = m.role === "assistant" ? splitMessage(m.content) : { visible: m.content, latex: null, filename: "report" };
            return (
            <Fragment key={m.id}>
            <div className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center"><Bot className="h-4 w-4 text-primary" /></div>}
              {(!m.pdfState || m.content) && (
              <div className={`max-w-[75%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.content ? (
                  <Markdown content={visible || (latex ? "Here's your report! Click below to preview or download." : "")} />
                ) : m.pdfState ? null : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                  </span>
                )}
              </div>
              )}
              {m.role === "user" && <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center"><User className="h-4 w-4" /></div>}
            </div>
            {/* Collapsible reasoning block */}
            {m.role === "assistant" && m.thinking && (
              <div className="flex justify-start ml-9">
                <div className="max-w-[75%] w-full">
                  <button
                    onClick={() => setExpandedThinking((prev) => {
                      const next = new Set(prev);
                      next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                      return next;
                    })}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 cursor-pointer"
                  >
                    <Brain className="h-3 w-3 text-primary/60" />
                    <span>Reasoning</span>
                    {expandedThinking.has(m.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  {expandedThinking.has(m.id) && (
                    <ReasoningScrollArea text={m.thinking} />
                  )}
                </div>
              </div>
            )}
            {/* PDF process card */}
            {m.role === "assistant" && (m.pdfState || latex) && (
              <div className="ml-9">
                <PdfProcessCard
                  pdfState={m.pdfState ?? "ready"}
                  pdfError={m.pdfError}
                  latex={latex}
                  filename={m.pdfFilename ?? filename ?? "report"}
                  precompiledPdf={m.precompiledPdf}
                  align="start"
                  maxWidth="max-w-[700px]"
                />
              </div>
            )}
            {m.role === "assistant" && (m.content || m.pdfState) && (
              <div className="flex gap-1 mt-1 justify-start">
                <button
                  onClick={() => copyMessage(visible || "PDF report generated.")}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Copy message"
                >
                  <Copy className="h-3 w-3" />
                </button>
                {!streaming && (
                  <RegenerateButton onClick={() => handleRetry(m.id)} />
                )}
              </div>
            )}
            {m.role === "user" && m.content && (
              <div className="flex gap-1 mt-1 justify-end">
                {!streaming && (
                  <button
                    onClick={() => handleRetry(m.id)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Resend message"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            </Fragment>
            );
          })}
        </div>
        <div className="space-y-2">
          {/* Thinking level selector */}
          <div className="flex items-center gap-1">
            <Brain className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground mr-1">Thinking:</span>
            {(["off", "auto", "on"] as ThinkingLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setThinking(level)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                  thinking === level
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {level === "off" ? "Off" : level === "auto" ? "Auto" : "On"}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {thinking === "on" && "· 4k token budget, thorough"}
              {thinking === "off" && "· no reasoning, fastest"}
              {thinking === "auto" && "· 1k token budget, balanced"}
            </span>
          </div>
          <div className="flex gap-2">
            <Textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Ask..." className="resize-none" />
            <Button
              onClick={streaming ? stopGeneration : send}
              disabled={!streaming && (!input.trim())}
              className={`self-end ${streaming ? "bg-destructive hover:bg-destructive/90" : ""}`}
            >
              {streaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
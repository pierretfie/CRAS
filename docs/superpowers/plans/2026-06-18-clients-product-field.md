# Clients Product Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `product` field to clients (mirroring `category`'s admin-curated pattern) plus three product-level analytics charts so users can see which products are being sold or enquired about most.

**Architecture:** Single migration adds `clients.product` (TEXT NULL) and a new `admin_products` table mirroring `admin_categories`. UI is wired through the same `Select + custom-fallback` pattern used for category. Analytics aggregates by product (with `status='won'`/`status='active'` slices for sold/enquired). No new dependency on AI normalization for product in v1.

**Tech Stack:** TanStack Start, React 19, Supabase JS for auth, raw `pg` queries via `src/lib/db.ts`, Tailwind + shadcn/ui, Recharts for analytics charts.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260619090000_add_client_product.sql` | Create | Adds `clients.product` and `admin_products` table + RLS |
| `src/integrations/supabase/types.ts` | Modify | Add `admin_products` table type + `product` column on `clients` Row/Insert/Update |
| `src/lib/analytics-compute.ts` | Modify | Add `byProduct`, `wonByProduct`, `enquiredByProduct` aggregations |
| `src/routes/_authenticated/admin.tsx` | Modify | Add `ProductsTab` + tab nav entry |
| `src/routes/_authenticated/clients.new.tsx` | Modify | Add Product field + state + INSERT column |
| `src/routes/_authenticated/clients.$id.tsx` | Modify | Add Product field to `EditClientDialog` + UPDATE column |
| `src/routes/_authenticated/clients.index.tsx` | Modify | Add Product list column + filter dropdown |
| `src/routes/_authenticated/analytics.tsx` | Modify | Add three `RankedBarChart` cards (Products / Sold / Enquired) |
| `src/routes/_authenticated/analytics.report.tsx` | Modify | Surface product data in AI context + PDF/LaTeX section |
| `scripts/check-product-field.cjs` | Create | One-shot `node pg` query asserting column + table exist |

---

## Phase 1 — Foundations (sequential)

### Task 1: Migration file + apply

**Files:**
- Create: `supabase/migrations/20260619090000_add_client_product.sql`
- Modify: nothing else at this step (apply happens via existing infra)

- [ ] **Step 1: Write the migration file `supabase/migrations/20260619090000_add_client_product.sql`**

```sql
-- Track the product a client is interested in / under sale.
-- Nullable so existing rows remain valid; curated list lives in admin_products.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS product text;

-- Admin-managed list of canonical product names. Admins curate, all users select.
CREATE TABLE IF NOT EXISTS public.admin_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_products TO authenticated;
GRANT ALL ON public.admin_products TO service_role;

ALTER TABLE public.admin_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_read"   ON public.admin_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_insert" ON public.admin_products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_update" ON public.admin_products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "products_delete" ON public.admin_products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS clients_product_idx ON clients (product);
```

- [ ] **Step 2: Apply the migration against the project's DB**

Run:

```bash
cd /home/maina/Documents/CRAS
DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) \
  psql "$DATABASE_URL" -f supabase/migrations/20260619090000_add_client_product.sql
```

Expected: a series of `ALTER TABLE` / `CREATE TABLE` / `CREATE POLICY` lines with no errors. `psql` exits 0.

If `psql` is unavailable, fall back to:

```bash
cd /home/maina/Documents/CRAS
node -e "
const {Client}=require('pg');
require('dotenv').config();
const fs=require('fs');
const c=new Client({connectionString:process.env.DATABASE_URL});
(async()=>{
  await c.connect();
  const sql=fs.readFileSync('supabase/migrations/20260619090000_add_client_product.sql','utf8');
  await c.query(sql);
  console.log('OK');
  await c.end();
})();
"
```

Expected output: `OK` on stdout.

- [ ] **Step 3: Verify schema applied**

Run:

```bash
DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-) \
  psql "$DATABASE_URL" -c "\d clients" -c "\d admin_products"
```

Expected: `clients` table shows a `product | text` column; `admin_products` table shows `id`, `name (unique)`, `created_at`.

- [ ] **Step 4: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add supabase/migrations/20260619090000_add_client_product.sql
git commit -m "feat(db): add clients.product column and admin_products table"
```

---

### Task 2: Update Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts`

- [ ] **Step 1: Add `admin_products` table block — insert immediately after the `admin_categories` block (after line 33)**

In `src/integrations/supabase/types.ts`, after:

```ts
      admin_categories: {
        Row: { created_at: string; id: string; name: string }
        Insert: { created_at?: string; id?: string; name: string }
        Update: { created_at?: string; id?: string; name?: string }
        Relationships: []
      }
```

add:

```ts
      admin_products: {
        Row: { created_at: string; id: string; name: string }
        Insert: { created_at?: string; id?: string; name: string }
        Update: { created_at?: string; id?: string; name?: string }
        Relationships: []
      }
```

- [ ] **Step 2: Add `product` to the `clients` type block (lines ~115-180)**

In each of `clients.Row`, `clients.Insert`, and `clients.Update` (three interface blocks), add the property `product: string | null` (omit on `Insert` if the migration semantics are nullable; for parity with `email` and `location` which are `string | null` on Row and `string | null` on Insert, use the same form on all three).

Pick any line inside each interface (e.g. after `contact_person_role`) and insert:

```ts
          product: string | null
```

(Align indentation with the surrounding fields — column-shape keys in `Row` are typically indented 10 spaces, in `Insert`/`Update` they're typically aligned similarly.)

- [ ] **Step 3: Verify no TS errors**

Run:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -40
```

Expected: empty output (or only pre-existing errors that aren't about `product` or `admin_products`).

- [ ] **Step 4: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/integrations/supabase/types.ts
git commit -m "feat(types): add product column and admin_products table types"
```

---

### Task 3: Analytics compute — three product aggregations

**Files:**
- Modify: `src/lib/analytics-compute.ts`

- [ ] **Step 1: Extend `computeAnalytics` with three product aggregations**

In `src/lib/analytics-compute.ts`, immediately after the `bestCategory` line (~ line 84) and before the `return { ... }` block, insert:

```ts
  // Product aggregations. null → "Unspecified" so existing rows are visible
  // in the dashboards rather than silently dropped. "Enquired" mirrors the
  // existing funnel definition (status='active') to keep semantics aligned.
  const UNSPECIFIED = "Unspecified";
  const bucketProduct = (v: string | null) =>
    v && v.trim() ? v : UNSPECIFIED;
  const byProduct: Record<string, number> = {};
  const wonByProduct: Record<string, number> = {};
  const enquiredByProduct: Record<string, number> = {};
  for (const c of clients) {
    const key = bucketProduct(c.product);
    byProduct[key] = (byProduct[key] ?? 0) + 1;
    if (c.status === "won") wonByProduct[key] = (wonByProduct[key] ?? 0) + 1;
    if (c.status === "active") enquiredByProduct[key] = (enquiredByProduct[key] ?? 0) + 1;
  }
```

- [ ] **Step 2: Surface them in the returned object**

Inside the `return { ... }` block, add after `bestCategory,`:

```ts
    byProduct,
    wonByProduct,
    enquiredByProduct,
```

- [ ] **Step 3: Verify TS**

Run:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output (or only pre-existing errors unrelated to `computeAnalytics`).

- [ ] **Step 4: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/lib/analytics-compute.ts
git commit -m "feat(analytics): aggregate by product with won and enquired slices"
```

---

## Phase 2 — UI surfaces (independent files; fan-out recommended)

Phase 2 tasks each touch a single file that doesn't depend on the others at the type level (analytics page/report *consume* `byProduct`/`wonByProduct`/`enquiredByProduct` but no other file changes those names). They can be dispatched in parallel.

### Task 4: Admin Products tab

**Files:**
- Modify: `src/routes/_authenticated/admin.tsx`

- [ ] **Step 1: Bump tab nav grid to 5 columns and add the Products tab trigger**

In `AdminPage`, find:

```tsx
        <TabsList className="grid grid-cols-4 max-w-xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="console">AI Console</TabsTrigger>
       </TabsList>
        <TabsContent value="users"><UsersTab</TabsContent>
        <TabsContent value="categories"><CategoriesTab</TabsContent>
        <TabsContent value="stages"><StagesTab</TabsContent>
        <TabsContent value="console"><ConsoleTab</TabsContent>
```

Replace with:

```tsx
        <TabsList className="grid grid-cols-5 max-w-xl">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="console">AI Console</TabsTrigger>
       </TabsList>
        <TabsContent value="users"><UsersTab</TabsContent>
        <TabsContent value="categories"><CategoriesTab</TabsContent>
        <TabsContent value="products"><ProductsTab</TabsContent>
        <TabsContent value="stages"><StagesTab</TabsContent>
        <TabsContent value="console"><ConsoleTab</TabsContent>
```

- [ ] **Step 2: Add the `ProductsTab` function — paste below `CategoriesTab` (after line 292) before `StagesTab`**

```tsx
function ProductsTab() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_products ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return;
    try {
      const res = await query('INSERT INTO admin_products (name) VALUES ($1)', [name.trim()]);
      if (res.error) throw res.error;
      setName("");
      qc.invalidateQueries({ queryKey: ["admin_products"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to add product");
    }
  }

  async function del(id: string) {
    try {
      const res = await query('DELETE FROM admin_products WHERE id = $1', [id]);
      if (res.error) throw res.error;
      qc.invalidateQueries({ queryKey: ["admin_products"] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Failed to delete product");
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Client Products</CardTitle><CardDescription>Products that can be selected when creating or editing a client</CardDescription</CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="New product" value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
       </div>
        <div className="space-y-1">
          {products?.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between border-b border-border pb-1">
              <span>{p.name</span>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4"</Button>
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
```

- [ ] **Step 3: Verify TS**

Run:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

- [ ] **Step 4: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/admin.tsx
git commit -m "feat(admin): add Products tab for curating admin_products"
```

---

### Task 5: Client create form — Product field

**Files:**
- Modify: `src/routes/_authenticated/clients.new.tsx`

- [ ] **Step 1: Extend form state with `product` / `customProduct` and add Products query**

In the `useState` block initializing `form`, add two fields:

```ts
    product: "",
    customProduct: "",
```

After the existing `categories` query, add a sibling `useQuery` for `admin_products`:

```tsx
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_products ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
```

- [ ] **Step 2: Add the Product `Field` as the first item in the Classification card**

In the Classification card (`<CardContent className="grid md:grid-cols-2 gap-4">`), replace the `<Field label="Category">…</Field>` block with the Product + Category pair (Product placed first so it gets visual prominence as the "key" new field):

```tsx
          <Field label="Product">
            <Select value={form.product} onValueChange={(v) => set("product", v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom"</SelectTrigger>
              <SelectContent>
                {products?.map((p: any) => <SelectItem key={p.id} value={p.name}>{p.name</SelectItem>)}
             </SelectContent>
           </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customProduct} onChange={(e) => set("customProduct", e.target.value)} />
         </Field>

          <Field label="Category">
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom"</SelectTrigger>
              <SelectContent>
                {categories?.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name</SelectItem>)}
             </SelectContent>
           </Select>
            <Input className="mt-2" placeholder="Or type custom" value={form.customCategory} onChange={(e) => set("customCategory", e.target.value)} />
         </Field>
```

- [ ] **Step 3: Update the INSERT to include `product`**

In the `save()` function's INSERT statement, change:

```sql
INSERT INTO clients (name, email, location, contact_person, contact_person_email, contact_person_phone, contact_person_role, category, mode_of_connection, current_stage, stage_value, stage_label, stage_notes, custom_fields, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
```

to:

```sql
INSERT INTO clients (name, email, location, contact_person, contact_person_email, contact_person_phone, contact_person_role, category, mode_of_connection, current_stage, stage_value, stage_label, stage_notes, product, custom_fields, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
```

and in the parameter array, right before `cf` (which is `$14`), add a new entry:

```ts
          (form.customProduct.trim() || form.product || null),
```

(So the values array now has 16 entries, with the new `product` value at index 14 zero-based / `$15` in SQL — wait, careful: the existing array is 15 entries at indexes 0–14. After inserting, index 14 is the product, index 15 is `cf`, etc. So the SQL has $1..$14 covering the original columns $1..$13 plus product = $14, $15 = custom_fields, $16 = created_by. Adjust if necessary to match the actual variable at that index. Work through the array deterministically by counting entries.)

The most robust approach: count the existing entries before/after your edit to confirm $↔index alignment. If the previous SQL was `$1..$15` and the array had indices 0..14:

| Index | SQL | Field |
|---|---|---|
| 0 | $1 | name |
| 1 | $2 | email |
| 2 | $3 | location |
| 3 | $4 | contact_person |
| 4 | $5 | contact_person_email |
| 5 | $6 | contact_person_phone |
| 6 | $7 | contact_person_role |
| 7 | $8 | category (preview) |
| 8 | $9 | mode_of_connection (preview) |
| 9 | $10 | current_stage |
| 10 | $11 | stage_value (preview) |
| 11 | $12 | stage_label (preview) |
| 12 | $13 | stage_notes |
| 13 | $14 | custom_fields → cf |
| 14 | $15 | created_by |

After inserting `product` between stage_notes and custom_fields (so SQL becomes `$1..$16`):

| Index | SQL | Field |
|---|---|---|
| 0..12 | $1..$13 | unchanged |
| 13 | $14 | product ← **insert this** |
| 14 | $15 | custom_fields |
| 15 | $16 | created_by |

So after splice:

```ts
          form.stage_notes,
          (form.customProduct.trim() || form.product || null),  // ← new
          cf,
          u.user.id,
        ]
```

Verify placeholders $1..$16 match. If the original INSERT ordering differs, adjust the splice point to position `product` adjacent to `stage_notes` (immediately before `cf`).

- [ ] **Step 4: Verify TS**

Run:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/clients.new.tsx
git commit -m "feat(clients): add Product field to create-client form"
```

---

### Task 6: Edit client dialog — Product field

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx`

- [ ] **Step 1: Extend `EditClientDialog` props and state with product**

In the `EditClientDialog` component, add `product: string | null` and `customProduct` props/state. Concretely, update the local state initializer so it includes `product` AND add `customProduct` for the fallback input:

```ts
  const [product, setProduct] = useState<string>(client.product ?? "");
  const [customProduct, setCustomProduct] = useState("");
```

(In the dialog's section that already initializes local fields from `client.*`, add these two lines.)

- [ ] **Step 2: Add the Products `useQuery` inside the dialog (or hoist it to the page level)**

Either hoist the Products query to `ClientDetailPage` and pass `products` down, or add a sibling `useQuery(["admin_products"], …)` inside `EditClientDialog`. Hoist when the dialog already receives other arrays from the page; add inline if the dialog currently owns all of its own queries.

Cleanest: paste the same `useQuery` block as in `clients.new.tsx` near the other queries inside the dialog (or sibling component that holds it). Since the dialog already runs its own queries, add inside:

```tsx
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_products ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
```

- [ ] **Step 3: Add the Product `Field` block to the dialog form (mirror the create form)**

Paste immediately after the existing contact fields (or wherever fields line up nicely in the form layout):

```tsx
          <Field label="Product">
            <Select value={product} onValueChange={setProduct}>
              <SelectTrigger><SelectValue placeholder="Pick or type custom"</SelectTrigger>
              <SelectContent>
                {products?.map((p: any) => <SelectItem key={p.id} value={p.name}>{p.name</SelectItem>)}
             </SelectContent>
           </Select>
            <Input className="mt-2" placeholder="Or type custom" value={customProduct} onChange={(e) => setCustomProduct(e.target.value)} />
         </Field>
```

(If the dialog wraps content in a `Field` helper component reuse the same helper; otherwise drop in a labelled block matching the surrounding style.)

- [ ] **Step 4: Update the UPDATE query inside the dialog**

In the dialog's UPDATE, change:

```sql
UPDATE clients SET
  name = $1,
  email = $2,
  …
  contact_person_role = $7
WHERE id = $8
```

(add a `, product = $N` line). Concretely, append `, product = $9` and add the value to the parameter array. With seven existing fields (name..contact_person_role) plus `id`, the array was 8 entries `$1..$8`. After add: nine entries `$1..$9`.

```ts
const newProduct = customProduct.trim() || product || null;
// ...
await query(
  `UPDATE clients SET name = $1, email = $2, location = $3, contact_person = $4, contact_person_email = $5, contact_person_phone = $6, contact_person_role = $7, product = $8 WHERE id = $9`,
  [name, email, …, newProduct, client.id]
);
```

If your current SET list has different field names/order, splice `, product = $N` after `contact_person_role` such that `$N` matches `newProduct`'s index in the param array.

- [ ] **Step 5: Verify TS and commit**

Run:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "feat(clients): add Product field to EditClientDialog"
```

---

### Task 7: Clients list — Product column + filter

**Files:**
- Modify: `src/routes/_authenticated/clients.index.tsx`

- [ ] **Step 1: Add a Products `useQuery` for the filter dropdown**

In the same query section, add:

```tsx
  const { data: products } = useQuery({
    queryKey: ["admin_products"],
    queryFn: async () => {
      const res = await query('SELECT * FROM admin_products ORDER BY name');
      if (res.error) throw res.error;
      return res.data;
    },
  });
```

And add a `product` default in any existing filter state:

```tsx
  const [productFilter, setProductFilter] = useState<string>("all");
```

- [ ] **Step 2: Add Product column in the TableHead / TableCell**

In the `<TableHeader>` `<TableRow>`, after the Category `<TableHead>`, add:

```tsx
                <TableHead>Product</TableHead>
```

In the `<TableBody>` `<TableRow>` for each client, after the Category cell, add:

```tsx
                  <TableCell>{c.product ?? "—"}</TableCell>
```

- [ ] **Step 3: Add Product filter dropdown beside the Category filter**

Beside the existing Category filter Select, add:

```tsx
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All products"</SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="__unspecified__">Unspecified</SelectItem>
                {products?.map((p: any) => <SelectItem key={p.id} value={p.name}>{p.name</SelectItem>)}
             </SelectContent>
           </Select>
```

(Follow the same `Card`/row layout as the existing filters.)

- [ ] **Step 4: Wire the filter into the existing client-side filter**

In the existing `clients.filter(...)` (or wherever filter predicates are composed), add:

```ts
  const filtered = clients.filter((c) => {
    // existing predicates …
    if (productFilter === "__unspecified__") return !c.product;
    if (productFilter !== "all") return c.product === productFilter;
    return true;
  });
```

Wrap into the existing predicate composition. Make sure existing predicates remain AND-style.

- [ ] **Step 5: Verify TS and commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/clients.index.tsx
git commit -m "feat(clients): show product column and filter on /clients list"
```

---

### Task 8: Analytics page — three product charts

**Files:**
- Modify: `src/routes/_authenticated/analytics.tsx`

- [ ] **Step 1: Add a `productChartConfig` next to existing chart configs**

Next to `categoryChartConfig`:

```tsx
const productChartConfig: ChartConfig = {
  value: { label: "Clients", color: NEUTRAL },
};
```

- [ ] **Step 2: After the existing mode/category computation, build three product datasets ranked**

Right after the `catData` computation:

```tsx
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
```

(Note: percentages here are intentionally share-of-total-clients — same denominator the existing categories chart uses — for visual comparability. If you want share-of-active-only or no percentages, adjust; keep consistent with the existing Categories chart for now.)

- [ ] **Step 3: Render three new Cards with `RankedBarChart`**

Inside the `<div className="grid lg:grid-cols-2 gap-4">` block containing the Categories card, add three sibling Cards:

```tsx
        <Card>
          <CardHeader><CardTitle>Products</CardTitle><CardDescription>All clients per product, ranked</CardDescription</CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={productData} config={productChartConfig} />
         </CardContent>
       </Card>

        <Card>
          <CardHeader><CardTitle>Sold by Product</CardTitle><CardDescription>Won clients per product, ranked</CardDescription</CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={wonByProductData} config={productChartConfig} />
         </CardContent>
       </Card>

        <Card>
          <CardHeader><CardTitle>Enquired by Product</CardTitle><CardDescription>Active clients per product, ranked</CardDescription</CardHeader>
          <CardContent style={{ height: 280 }}>
            <RankedBarChart data={enquiredByProductData} config={productChartConfig} />
         </CardContent>
       </Card>
```

Place them after the existing Categories card. The grid will wrap onto more rows; that is fine.

- [ ] **Step 4: Verify TS and commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/analytics.tsx
git commit -m "feat(analytics): add Products, Sold by Product, Enquired by Product charts"
```

---

### Task 9: Analytics report — AI context + PDF/LaTeX section

**Files:**
- Modify: `src/routes/_authenticated/analytics.report.tsx`

- [ ] **Step 1: Extend `buildContextString` to include product data**

Find the function that builds the analytics context string (the long `\`...\`` template that lists Total clients, Conversion rate, Active, etc.). Add a new block:

Inside the template, after the existing "Top channels" / "Categories" block, insert:

```ts
const topN = (rec: Record<string, number>, n = 5) =>
  Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${k} (${v})`).join(", ");

// ... inside the template literal:
Products (all): ${topN(data.byProduct)}
Products (sold): ${topN(data.wonByProduct)}
Products (enquired): ${topN(data.enquiredByProduct)}
```

(Adjust placement to whichever line keeps the AI context readable; consistent with how category data is described inline.)

- [ ] **Step 2: Add a Products section to the PDF/LaTeX export**

Find the existing function that emits the PDF or LaTeX body — there are two paths (`downloadPdf` and likely `downloadLatex` or a single function). Mirror the existing "Categories" section and create a parallel one:

```ts
const productsSection = `
\\section*{Products}
\\textbf{By total clients:} ${topN(data.byProduct)}\\\\
\\textbf{Sold (won):} ${topN(data.wonByProduct)}\\\\
\\textbf{Enquired (active):} ${topN(data.enquiredByProduct)}
`;
```

(if the export is HTML-based rather than LaTeX, use the equivalent HTML list/markup).

If there is just one export path (no separate LaTeX), add the section in that single path.

- [ ] **Step 3: Wire the new section into the export**

In the function that assembles the document (where existing `modeSection`, `categorySection`, `topPerformersSection` are concatenated), add `productsSection` next to them.

- [ ] **Step 4: Verify TS and commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | head -20
```

Expected: empty output.

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add src/routes/_authenticated/analytics.report.tsx
git commit -m "feat(analytics): surface product analytics in AI report context and document"
```

---

## Phase 3 — Smoke + verify

### Task 10: Schema smoke script

**Files:**
- Create: `scripts/check-product-field.cjs`

- [ ] **Step 1: Write the smoke script**

```js
// Verifies that the clients.product column and admin_products table are present
// and round-trip cleanly. Run from the project root with DATABASE_URL set in .env.
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing — set it in .env');
    process.exit(2);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // 1. clients.product column exists and is nullable text
    const col = await c.query(`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'clients'
        AND column_name = 'product'
    `);
    if (col.rows.length === 0) throw new Error('clients.product column missing');
    if (col.rows[0].data_type !== 'text') throw new Error(`clients.product type is ${col.rows[0].data_type}, expected text`);
    if (col.rows[0].is_nullable !== 'YES') throw new Error('clients.product is not nullable');
    console.log('OK clients.product is nullable text');

    // 2. admin_products table round-trips INSERT/SELECT/DELETE
    await c.query('INSERT INTO admin_products (name) VALUES ($1) RETURNING id', ['__smoke_test_product__']);
    const sel = await c.query('SELECT name FROM admin_products WHERE name = $1', ['__smoke_test_product__']);
    if (sel.rows.length !== 1) throw new Error('admin_products INSERT did not surface in SELECT');
    await c.query('DELETE FROM admin_products WHERE name = $1', ['__smoke_test_product__']);
    const after = await c.query('SELECT name FROM admin_products WHERE name = $1', ['__smoke_test_product__']);
    if (after.rows.length !== 0) throw new Error('admin_products DELETE did not clean up');
    console.log('OK admin_products INSERT/SELECT/DELETE round-trip');

    // 3. SELECT * FROM clients (a few rows) and confirm .product is null|string, never throws
    const sample = await c.query('SELECT product FROM clients LIMIT 5');
    for (const row of sample.rows) {
      const v = row.product;
      if (v !== null && typeof v !== 'string') throw new Error('clients.product returned non-string non-null');
    }
    console.log(`OK clients.product returned ${sample.rows.length} rows, all null or string`);

    console.log('ALL CHECKS PASSED');
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
node scripts/check-product-field.cjs
```

Expected output:

```
OK clients.product is nullable text
OK admin_products INSERT/SELECT/DELETE round-trip
OK clients.product returned N rows, all null or string
ALL CHECKS PASSED
```

- [ ] **Step 3: Commit**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git add scripts/check-product-field.cjs
git commit -m "test(db): smoke test for clients.product and admin_products"
```

---

### Task 11: Final TS sweep + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run full TS check**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
npx tsc --noEmit 2>&1 | tee /tmp/last-tsc.log
```

Expected: empty `tee` output. If non-empty, every error in `/tmp/last-tsc.log` must be addressed before merging.

- [ ] **Step 2: Run the dev server in the background**

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
VITE_BYPASS_AUTH=true npm run dev > /tmp/cras-dev.log 2>&1 &
echo $! > /tmp/cras-dev.pid
```

Wait until `/tmp/cras-dev.log` contains a `ready`/`Local:` line:

```bash
until grep -qE 'Local:|ready in' /tmp/cras-dev.log 2>/dev/null; do sleep 1; done
tail -20 /tmp/cras-dev.log
```

- [ ] **Step 3: Manual browser smoke (use playwright MCP)**

1. Navigate to `http://localhost:8080/admin`.
2. Click the **Products** tab; add a product "Watson-AI"; confirm it shows in the list. Then delete it; confirm it's gone.
3. Navigate to `http://localhost:8080/clients/new`.
4. Fill form (any name), pick a Category and a Product (or type custom). Confirm the field renders.
5. Submit; on next page confirm the new client appears.
6. Navigate to `http://localhost:8080/clients`. Confirm the new row shows the product in the **Product** column.
7. Use the **Product** filter dropdown; switch to "Unspecified" and back to "All"; confirm filtering works.
8. Click the client → opens detail page → click an edit control → change Product via Select + custom-text fallback; save; confirm the change round-trips.
9. Navigate to `http://localhost:8080/analytics`. Confirm three Cards render: **Products**, **Sold by Product**, **Enquired by Product**. Each should show "Unspecified" once you have a row without a product.
10. Visit `/analytics/report` and ask the AI: "which product is being sold most?" — confirm the AI references the products data.

If any step fails, fix and re-run from that step.

- [ ] **Step 4: Stop the dev server**

```bash
kill "$(cat /tmp/cras-dev.pid)" || true
```

- [ ] **Step 5: Final commit summary**

Print the log of commits added in this branch:

```bash
cd /home/maina/Documents/CRAS/.claude/worktrees/client-product-field
git log --oneline worktree-client-product-field ^main
```

Expected: 9 commits corresponding to Tasks 1-10 (Task 11 is verification only).

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Data Model — migration | T1 |
| Data Model — types.ts | T2 |
| Admin Products CRUD | T4 |
| Client Create Form | T5 |
| Edit Client Dialog | T6 |
| Clients List View | T7 |
| Analytics Compute | T3 |
| Analytics Page | T8 |
| Analytics Report | T9 |
| Schema smoke | T10 |
| Manual smoke | T11 |

All sections covered. ✅

**Placeholder scan:** No "TBD/TODO/implement later" phrases; every code step has actual code; no "similar to Task N" links to other tasks — each step is self-contained.

**Type consistency:** `byProduct`, `wonByProduct`, `enquiredByProduct` defined in T3 are consumed identically in T8 (analytics page) and T9 (analytics report). `["admin_products"]` queryKey used uniformly in T4, T5, T6, T7. SQL column name `product` always nullable. `Unspecified` literal used consistently in T3 filter bucket and T7 filter value.

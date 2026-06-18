# Add Product Field to Clients

Date: 2026-06-18
Status: Approved (design complete; pending plan → implementation)

## Goal

Let clients carry the **product** they are interested in / are being sold — a single canonical label per client. Surface product-level analytics on `/analytics` so we can answer *"which product is being sold most?"* and *"which product is being enquired about most?"* Include products in the AI-driven analytics report.

## Background

CRAS already models a similar single-value classification, `category`, with a Select dropdown fed from an admin-curated `admin_categories` table and a custom-text fallback. The same pattern is the natural model for product. We use the existing client `status` field (`active` / `won` / `lost`) to derive sales/enquiry analytics without a new status column on the product assignment.

## Data Model

### Migration: `supabase/migrations/20260619090000_add_client_product.sql`

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

Mirrors every pattern from `admin_categories` (created at line 25 of `20260616073537_5b8502e1-4e34-4335-8fa9-06e35fe735b6.sql`). Rationale:

- `clients.product` is `TEXT NULL` (not `NOT NULL`) — existing rows stay valid; users fill it in over time. We will surface null as `—`/`Unspecified` rather than rejecting.
- `admin_products.name` is `UNIQUE` to prevent drift when admins type variants.
- The `clients_product_idx` lookup index supports the `/clients` filter and the analytics aggregations.

### Types: `src/integrations/supabase/types.ts`

Add `admin_products` table type (mirrors `admin_categories` block at line 17). Add `product: string | null` to `clients.Row`, `clients.Insert`, `clients.Update`.

The file is normally regenerated from schema; until we regenerate, hand-edit. Both methods must end with consistent content.

## Admin Products CRUD

**File:** `src/routes/_authenticated/admin.tsx`

Mirror the existing `CategoriesTab` (lines 237–292) as a new `ProductsTab`:

- `useQuery(["admin_products"])` → `SELECT * FROM admin_products ORDER BY name`
- INSERT → `query('INSERT INTO admin_products (name) VALUES ($1)', [name.trim()])`
- DELETE → `query('DELETE FROM admin_products WHERE id = $1', [id])`
- Invalidate `["admin_products"]` on both mutating actions.
- Card UI: Input + Add button + list of rows with delete button.

Add a fifth tab "Products" to the existing tabs in `AdminPage` (currently 4 columns `grid-cols-4 max-w-xl`):

```tsx
<TabsList className="grid grid-cols-5 max-w-xl">
  <TabsTrigger value="users">Users</TabsTrigger>
  <TabsTrigger value="categories">Categories</TabsTrigger>
  <TabsTrigger value="products">Products</TabsTrigger>
  <TabsTrigger value="stages">Stages</TabsTrigger>
  <TabsTrigger value="console">AI Console</TabsTrigger>
</TabsList>
```

## Client Create Form

**File:** `src/routes/_authenticated/clients.new.tsx`

- Add `product` and `customProduct` to form state.
- Add a Products `useQuery(["admin_products"])` (same query as Admin Products Tab) so the Select is populated.
- Add Product as the **first** item in the Classification card (right after the card already has Category | Mode | Stage | Stage Description in a 2-col grid; reordering puts Product in row 1 with Category in the same row).
- `Field` shape, mirroring Category:

```tsx
<Field label="Product">
  <Select value={form.product} onValueChange={(v) => set("product", v)}>
    <SelectTrigger><SelectValue placeholder="Pick or type custom</SelectTrigger>
    <SelectContent>
      {products?.map((p: any) => <SelectItem key={p.id} value={p.name}>{p.name</SelectItem>)}
   </SelectContent>
 </Select>
  <Input className="mt-2" placeholder="Or type custom" value={form.customProduct} onChange={(e) => set("customProduct", e.target.value)} />
</Field>
```

- Resolve on save: `const prod = form.customProduct.trim() || form.product || null;`
- INSERT grows by one column at `$16`:

```sql
INSERT INTO clients (..., category, mode_of_connection, current_stage, stage_value, stage_label, stage_notes, product, custom_fields, created_by)
VALUES (..., $8, $9, $10, $11, $12, $13, $14, $15, $16)
```

(or keep the column order; we'll add `product` after `stage_notes` and before `custom_fields`).

- **No AI normalization for product in v1.** Users either picked an admin-curated name (admin owns the canonical form) or typed a custom string (their phrasing is what they want saved). Re-running AI on this would risk duplicating separate admin-curated entries. The `runAI` validator and `preview.category`/`modeOfConnection` flow stays unchanged.

- Product is optional. Do not add it to `runAI`'s required-field check.

## Edit Client Dialog

**File:** `src/routes/_authenticated/clients.$id.tsx`

- The local `EditClientDialog` component (around line 148) is rebuilt:
  - Add `product` and `customProduct` local state, defaulting from the existing client's value.
  - Add the same Field block.
  - Same Products query for the Select.
  - On save, UPDATE adds `product = $N` to the SET clause.
  - The product value is resolved the same way: `customProduct.trim() || product || null`.

## Clients List View

**File:** `src/routes/_authenticated/clients.index.tsx`

- Add a new column `<TableCell>` between Category and Mode showing `{c.product ?? "—"}`.
- Add a new filter dropdown beside Category: "All Products / Unspecified / <each product in `admin_products`>".
- Client-side filtering already uses simple includes; the list filter maps to `(c.product ?? "—") === filter` semantics.

## Analytics

### Compute: `src/lib/analytics-compute.ts`

Three new aggregations on `computeAnalytics`:

```ts
const UNSPECIFIED = "Unspecified";
function bucket(value: string | null): string {
  return value && value.trim() ? value : UNSPECIFIED;
}

const byProduct: Record<string, number> = {};
const wonByProduct: Record<string, number> = {};
const enquiredByProduct: Record<string, number> = {};
for (const c of clients) {
  const key = bucket(c.product);
  byProduct[key] = (byProduct[key] ?? 0) + 1;
  if (c.status === "won")    wonByProduct[key]      = (wonByProduct[key] ?? 0) + 1;
  if (c.status === "active") enquiredByProduct[key] = (enquiredByProduct[key] ?? 0) + 1;
}
```

Add them to the returned object. The "enquired" bucket uses `status='active'` — exact same predicate as the funnel and stale-clients computation, so a client counted as "enquired for product X" is also counted as "enquired" in the existing funnel. Document this in code comments.

### Page: `src/routes/_authenticated/analytics.tsx`

Three new `RankedBarChart` cards in the same `grid lg:grid-cols-2 gap-4` row as Categories. After Categories → row 3 becomes: Categories | Products; row 4: Sold by Product | Enquired by Product. Or keep the row count balanced by trimming the layout — implementer chooses; aim for visual balance.

### Report: `src/routes/_authenticated/analytics.report.tsx`

- Extend `buildContextString` to include top entries from each of the three product aggregations (e.g. top 5 names + counts).
- Add a "Products" section to the PDF/LaTeX output, mirroring the existing "Categories" section.

## Edge Cases

1. **Existing rows (no product).** Throughout the UI and analytics we treat null as the literal string `"Unspecified"`. In tables/detail views it renders as `—`. In filter dropdowns there's an explicit "Unspecified" option so users can find null-product rows.
2. **Empty product value in `customProduct`.** Treated as null and falls through to `product` (which can also fall through to null). Empty-string vs whitespace on the client side is stripped via `.trim()` before falling through.
3. **Deleting an admin-curated product while clients reference it.** Allowed. Clients keep the historical string; aggregations still group by raw string. Future migration to FK or backing catalog reconciliation is out of scope for v1.
4. **AI normalization.** Skipped for product (see above). If we add it later, normalize only when `customProduct` is set, and have AI pick from existing `admin_products` names when possible.

## Testing

### Unit (`src/lib/analytics-compute.test.ts`)

Add cases asserting:

- Three clients with products A, B, A produce `byProduct = { A: 2, B: 1 }`.
- Mixed statuses produce correct `wonByProduct` (only won) and `enquiredByProduct` (only active).
- Null product on a client routes to the `Unspecified` bucket.
- Empty input array returns three empty records.

### Schema smoke

A standalone Node script (`scripts/check-product-field.cjs` or similar):

- `SELECT product FROM clients LIMIT 1` succeeds against the deployed DB.
- `SELECT * FROM admin_products` succeeds.
- Inserts one row into `admin_products` and deletes it (round-trip).
- Per-row from `clients`, the column returns `string | null`, never throws.

### Manual smoke

With `VITE_BYPASS_AUTH=true` (already configured) and the dev server at `localhost:8080`:

1. Visit `/admin`, Products tab, add and delete a product.
2. Visit `/clients/new`, fill Product via both Select and custom-text fallback; submit; verify row appears on `/clients`.
3. Visit `/clients/$id`, edit Product via the EditClientDialog; verify round-trip.
4. Visit `/clients`, filter by Product, switch to Unspecified; verify behavior.
5. Visit `/analytics`, confirm Products, Sold by Product, Enquired by Product charts render with values from prior inserts.
6. Visit `/analytics/report`, ask the AI "what product is being sold most?"; confirm the AI references the new aggregations.

## Out of Scope (v2 candidates)

- Multiple products per client (multi-select chip UI; would require either a `TEXT[]` column, a `client_products` join table, or JSONB array).
- AI-normalized product names (would require trusting AI to pick canonical names from `admin_products`).
- Product FK enforcement and orphaned-string reconciliation.
- Per-product revenue/value column (would change the analytics questions to "revenue per product" rather than "clients per product").
- Category-level opt-in vs zero-config product list bootstrap.

## Open Decisions

None — design is settled. All tradeoffs documented in-line above.

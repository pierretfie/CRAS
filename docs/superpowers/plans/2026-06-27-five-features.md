# Five CRM Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AI stage classification fallback, contact phone bug fix, interest scale slider, follow-up system with reminders, and CSV bulk client import.

**Architecture:** Each feature is independent. Database migrations first (interest_scale column, client_follow_ups table), then UI changes. Features build on shared components (StageUpdateDialog, client detail page).

**Tech Stack:** React, TypeScript, Supabase, shadcn/ui (Slider, Dialog, Badge, Switch), TanStack Router/Query, Notification API

## Global Constraints
- Project: React + TypeScript + Vite 8 + TanStack Router/Query + Supabase + shadcn/ui
- AI uses NVIDIA API via `@/lib/ai-nvidia.server`
- `pdflatex` available at `/usr/bin/pdflatex`
- Follow existing code patterns and naming conventions
- All new DB tables need RLS policies
- No comments unless asked

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/20260627000000_add_interest_scale.sql`
- Create: `supabase/migrations/20260627000001_create_client_follow_ups.sql`

**Interfaces:**
- Consumes: None (first task)
- Produces: `clients.interest_scale` column, `client_follow_ups` table

- [ ] **Step 1: Create interest_scale migration**

```sql
-- supabase/migrations/20260627000000_add_interest_scale.sql
ALTER TABLE clients ADD COLUMN interest_scale DECIMAL(3,1) NOT NULL DEFAULT 5.0;
```

- [ ] **Step 2: Create client_follow_ups migration**

```sql
-- supabase/migrations/20260627000001_create_client_follow_ups.sql
CREATE TABLE client_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  frequency TEXT NOT NULL DEFAULT 'daily',
  custom_interval_days INT,
  note TEXT,
  next_reminder TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE client_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own follow-ups"
  ON client_follow_ups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follow-ups"
  ON client_follow_ups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own follow-ups"
  ON client_follow_ups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follow-ups"
  ON client_follow_ups FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_client_follow_ups_user_status ON client_follow_ups(user_id, status);
CREATE INDEX idx_client_follow_ups_next_reminder ON client_follow_ups(next_reminder) WHERE status = 'active';
```

- [ ] **Step 3: Run migrations**

Run: `cd /home/maina/Documents/CRAS && supabase db push` or apply via Supabase dashboard

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add interest_scale column and client_follow_ups table"
```

---

## Task 2: Contact Phone Bug Fix — Save Fields on New Client

**Files:**
- Modify: `src/routes/_authenticated/clients.new.tsx:111-125` (insert query)

**Interfaces:**
- Consumes: None
- Produces: contact_person_phone, contact_person_email, contact_person_role saved to DB

- [ ] **Step 1: Read current insert query**

Read `src/routes/_authenticated/clients.new.tsx` lines 101-139 to see the save function.

- [ ] **Step 2: Add missing fields to insert**

Find the `supabase.from("clients").insert(...)` call. Add `contact_person_phone`, `contact_person_email`, `contact_person_role` to both the columns and values arrays.

Current (approx):
```typescript
const { error } = await supabase.from("clients").insert({
  name, email, location, contact_person, category, mode_of_connection,
  product, current_stage, stage_value, stage_label, stage_notes,
  custom_fields, created_by: u.user.id,
});
```

Change to:
```typescript
const { error } = await supabase.from("clients").insert({
  name, email, location, contact_person, contact_person_phone, contact_person_email, contact_person_role,
  category, mode_of_connection, product, current_stage, stage_value, stage_label, stage_notes,
  custom_fields, created_by: u.user.id,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/clients.new.tsx
git commit -m "fix: save contact_person_phone/email/role on new client creation"
```

---

## Task 3: Contact Phone Bug Fix — Display on Dashboard

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx:83-98` (Details card)

**Interfaces:**
- Consumes: client object with contact_person_phone, contact_person_email, contact_person_role
- Produces: Displayed in Details card

- [ ] **Step 1: Read current Details card**

Read `src/routes/_authenticated/clients.$id.tsx` lines 83-98 to see the Detail components.

- [ ] **Step 2: Add missing detail fields**

After the existing Detail components, add:
```tsx
<Detail label="Contact Phone" value={client.contact_person_phone} />
<Detail label="Contact Email" value={client.contact_person_email} />
<Detail label="Contact Role" value={client.contact_person_role} />
```

- [ ] **Step 3: Add to EditClientDialog**

In the EditClientDialog, add state and input fields for `contact_person_phone`, `contact_person_email`, `contact_person_role`. Include them in the update query.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "fix: display and edit contact_person_phone/email/role on dashboard"
```

---

## Task 4: Interest Scale — New Client Form

**Files:**
- Modify: `src/routes/_authenticated/clients.new.tsx` (add slider state + UI)

**Interfaces:**
- Consumes: clients.interest_scale column (DECIMAL 1-10)
- Produces: interest_scale saved with new client

- [ ] **Step 1: Add state variable**

Add `const [interestScale, setInterestScale] = useState(5);` to the form state.

- [ ] **Step 2: Add Slider to form**

After the product field, add:
```tsx
<div className="space-y-2">
  <Label>Interest Scale</Label>
  <div className="flex items-center gap-4">
    <Slider
      min={1}
      max={10}
      step={0.1}
      value={[interestScale]}
      onValueChange={([v]) => setInterestScale(v)}
      className="flex-1"
    />
    <span className="text-sm font-medium w-12 text-right">{interestScale.toFixed(1)}</span>
  </div>
  <p className="text-xs text-muted-foreground">1 = Low interest, 10 = Very high interest</p>
</div>
```

- [ ] **Step 3: Add to insert query**

Add `interest_scale: interestScale` to the supabase insert object.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/clients.new.tsx
git commit -m "feat: add interest scale slider to new client form"
```

---

## Task 5: Interest Scale — Display on Dashboard + Update Dialog

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx` (detail display + slider in dialog)

**Interfaces:**
- Consumes: client.interest_scale
- Produces: Interest scale displayed and editable

- [ ] **Step 1: Add to Details card**

After the existing Detail components, add:
```tsx
<Detail label="Interest Scale" value={client.interest_scale?.toFixed(1)} />
```

- [ ] **Step 2: Add Slider to StageUpdateDialog**

Add `interestScale` state initialized from `client.interest_scale`. Add Slider UI in the dialog. Include `interest_scale` in the update query.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "feat: display and edit interest scale on client dashboard"
```

---

## Task 6: AI Stage Classification — Timeout Detection + Fallback Popup

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx` (StageUpdateDialog)

**Interfaces:**
- Consumes: AI classification from `classifyStageValueAI`
- Produces: Popup shown on AI failure, retry/cancel options

- [ ] **Step 1: Add timeout and fallback state**

In StageUpdateDialog, add:
```typescript
const [aiLoading, setAiLoading] = useState(false);
const [aiFailed, setAiFailed] = useState(false);
const [showFallback, setShowFallback] = useState(false);
```

- [ ] **Step 2: Wrap AI call with timeout**

Replace the direct AI call with a timeout-wrapped version:
```typescript
const classifyWithTimeout = async (description: string) => {
  setAiLoading(true);
  setAiFailed(false);
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI timeout")), 120000)
    );
    const aiPromise = classifyStageValueAI(description, client.current_stage);
    const result = await Promise.race([aiPromise, timeoutPromise]);
    setAiLoading(false);
    return result;
  } catch {
    setAiLoading(false);
    setAiFailed(true);
    setShowFallback(true);
    return null;
  }
};
```

- [ ] **Step 3: Add fallback popup UI**

When `showFallback` is true, render a modal overlay:
```tsx
{showFallback && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4">
      <h3 className="text-lg font-semibold">AI Classification Unavailable</h3>
      <p className="text-sm text-muted-foreground">Is this client progressing well?</p>
      <div className="flex gap-3">
        <Button variant="outline" className="flex-1 bg-green-50 hover:bg-green-100 text-green-700"
          onClick={() => { setStageValue(1); setShowFallback(false); }}>
          On Track
        </Button>
        <Button variant="outline" className="flex-1 bg-red-50 hover:bg-red-100 text-red-700"
          onClick={() => { setStageValue(0); setShowFallback(false); }}>
          At Risk
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setShowFallback(false); retryClassification(); }}>
          Retry AI
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowFallback(false)}>
          Cancel
        </Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add retry function**

```typescript
const retryClassification = async () => {
  const result = await classifyWithTimeout(description);
  if (result) {
    setStageValue(result.stageValue);
    // AI classified successfully, no popup needed
  }
};
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "feat: add AI timeout detection and fallback popup for stage classification"
```

---

## Task 7: Follow-Up System — Service Layer

**Files:**
- Create: `src/lib/follow-ups.ts`

**Interfaces:**
- Consumes: Supabase client, client_follow_ups table
- Produces: CRUD functions for follow-ups

- [ ] **Step 1: Create follow-ups service**

```typescript
import { supabase } from "@/integrations/supabase/client";

export interface FollowUp {
  id: string;
  client_id: string;
  user_id: string;
  frequency: string;
  custom_interval_days: number | null;
  note: string | null;
  next_reminder: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function getActiveFollowUps(userId: string): Promise<FollowUp[]> {
  const { data, error } = await supabase
    .from("client_follow_ups")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("next_reminder", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createFollowUp(
  clientId: string,
  userId: string,
  frequency: string,
  note: string | null,
  customIntervalDays?: number
): Promise<FollowUp> {
  const nextReminder = computeNextReminder(frequency, customIntervalDays);
  const { data, error } = await supabase
    .from("client_follow_ups")
    .insert({
      client_id: clientId,
      user_id: userId,
      frequency,
      custom_interval_days: customIntervalDays || null,
      note,
      next_reminder: nextReminder.toISOString(),
      status: "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_follow_ups")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function completeFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_follow_ups")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function computeNextReminder(frequency: string, customDays?: number): Date {
  const now = new Date();
  switch (frequency) {
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "every_2_days":
      return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "custom":
      return new Date(now.getTime() + (customDays || 1) * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

export function suggestFrequency(interestScale: number, currentStage: number): string {
  if (interestScale >= 7 && currentStage >= 3) return "weekly";
  if (interestScale >= 5) return "every_2_days";
  return "daily";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/follow-ups.ts
git commit -m "feat: add follow-ups service layer"
```

---

## Task 8: Follow-Up System — Toggle in StageUpdateDialog

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx` (StageUpdateDialog)

**Interfaces:**
- Consumes: createFollowUp, cancelFollowUp from `src/lib/follow-ups.ts`
- Produces: Follow-up created/cancelled on stage update

- [ ] **Step 1: Add follow-up state to dialog**

```typescript
const [setFollowUp, setSetFollowUp] = useState(false);
const [followUpFrequency, setFollowUpFrequency] = useState("daily");
const [followUpNote, setFollowUpNote] = useState("");
```

- [ ] **Step 2: Add UI toggle in dialog**

After the description textarea, add:
```tsx
<div className="space-y-2 border-t pt-4">
  <div className="flex items-center justify-between">
    <Label>Set Follow-up?</Label>
    <Switch checked={setFollowUp} onCheckedChange={setSetFollowUp} />
  </div>
  {setFollowUp && (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Frequency</Label>
        <Select value={followUpFrequency} onValueChange={setFollowUpFrequency}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="every_2_days">Every 2 Days</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Note (optional)</Label>
        <Input placeholder="What to follow up about..." value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} />
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Create follow-up on save**

In the save function, after successful stage update, add:
```typescript
if (setFollowUp) {
  await createFollowUp(client.id, u.user.id, followUpFrequency, followUpNote || null);
  toast.success("Follow-up scheduled");
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "feat: add follow-up toggle to StageUpdateDialog"
```

---

## Task 9: Follow-Up System — Client Detail Page Section

**Files:**
- Modify: `src/routes/_authenticated/clients.$id.tsx` (new FollowUpSection component)

**Interfaces:**
- Consumes: getActiveFollowUps, cancelFollowUp from `src/lib/follow-ups.ts`
- Produces: Follow-up display and management on dashboard

- [ ] **Step 1: Create FollowUpSection component**

Add at bottom of file (before export):
```tsx
function FollowUpSection({ clientId }: { clientId: string }) {
  const { u } = useAuth();
  const queryClient = useQueryClient();
  const [followUps, setFollowUps] = useState<any[]>([]);

  useEffect(() => {
    if (u?.user) {
      getActiveFollowUps(u.user.id).then(ups => {
        setFollowUps(ups.filter(f => f.client_id === clientId));
      });
    }
  }, [u, clientId]);

  const handleCancel = async (id: string) => {
    await cancelFollowUp(id);
    setFollowUps(prev => prev.filter(f => f.id !== id));
    toast.success("Follow-up cancelled");
  };

  if (followUps.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4" /> Active Follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {followUps.map(f => (
          <div key={f.id} className="flex items-center justify-between p-2 border rounded">
            <div>
              <p className="text-sm font-medium capitalize">{f.frequency.replace("_", " ")}</p>
              <p className="text-xs text-muted-foreground">
                Next: {new Date(f.next_reminder).toLocaleDateString()}
              </p>
              {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={() => handleCancel(f.id)}>
              Cancel
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add FollowUpSection to page**

After the existing cards, add:
```tsx
<FollowUpSection clientId={client.id} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/clients.$id.tsx
git commit -m "feat: add follow-up section to client detail page"
```

---

## Task 10: Follow-Up System — Notification Bell

**Files:**
- Create: `src/components/follow-up-notifications.tsx`
- Modify: `src/routes/_authenticated/route.tsx` (add bell to nav)

**Interfaces:**
- Consumes: getActiveFollowUps from `src/lib/follow-ups.ts`
- Produces: Bell icon with count, dropdown with pending follow-ups

- [ ] **Step 1: Create FollowUpNotifications component**

```tsx
import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { getActiveFollowUps, completeFollowUp, type FollowUp } from "@/lib/follow-ups";
import { Badge } from "@/components/ui/badge";

export function FollowUpNotifications() {
  const { u } = useAuth();
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (u?.user) {
      getActiveFollowUps(u.user.id).then(setFollowUps).catch(() => {});
    }
  }, [u]);

  const overdue = followUps.filter(f => new Date(f.next_reminder) <= new Date());
  const upcoming = followUps.filter(f => new Date(f.next_reminder) > new Date());

  const handleComplete = async (id: string) => {
    await completeFollowUp(id);
    setFollowUps(prev => prev.filter(f => f.id !== id));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {followUps.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
              {followUps.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Follow-ups</h4>
          {followUps.length === 0 && (
            <p className="text-sm text-muted-foreground">No pending follow-ups</p>
          )}
          {overdue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-red-600">Overdue</p>
              {overdue.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 border border-red-200 rounded bg-red-50">
                  <div>
                    <p className="text-sm font-medium">{f.client_id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground">{f.note || f.frequency}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleComplete(f.id)}>
                    Done
                  </Button>
                </div>
              ))}
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Upcoming</p>
              {upcoming.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <p className="text-sm font-medium">{f.client_id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(f.next_reminder).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleComplete(f.id)}>
                    Done
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Add bell to route.tsx nav**

In the nav/header area, add:
```tsx
import { FollowUpNotifications } from "@/components/follow-up-notifications";

// In the nav, next to other icons:
<FollowUpNotifications />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/follow-up-notifications.tsx src/routes/_authenticated/route.tsx
git commit -m "feat: add follow-up notification bell to nav"
```

---

## Task 11: Follow-Up System — Browser Notifications

**Files:**
- Create: `src/lib/browser-notifications.ts`
- Modify: `src/routes/_authenticated/route.tsx` (request permission on mount)

**Interfaces:**
- Consumes: Notification API
- Produces: Browser push notifications for overdue follow-ups

- [ ] **Step 1: Create browser notifications utility**

```typescript
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function sendNotification(title: string, body: string, onClick?: () => void) {
  if (Notification.permission !== "granted") return;
  const notification = new Notification(title, { body, icon: "/favicon.ico" });
  if (onClick) notification.onclick = onClick;
}

export function checkOverdueFollowUps(followUps: { client_id: string; note: string | null; next_reminder: string }[]) {
  const now = new Date();
  const overdue = followUps.filter(f => new Date(f.next_reminder) <= now);
  if (overdue.length > 0) {
    sendNotification(
      "Follow-up Reminder",
      `You have ${overdue.length} overdue follow-up(s). Check your CRM dashboard.`
    );
  }
}
```

- [ ] **Step 2: Request permission on app mount**

In `route.tsx`, add useEffect:
```typescript
useEffect(() => {
  requestNotificationPermission();
}, []);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/browser-notifications.ts src/routes/_authenticated/route.tsx
git commit -m "feat: add browser notification support for follow-ups"
```

---

## Task 12: CSV Import — Parsing Logic

**Files:**
- Create: `src/lib/csv-parser.ts`

**Interfaces:**
- Consumes: CSV file (text)
- Produces: Parsed client objects

- [ ] **Step 1: Create CSV parser**

```typescript
export interface ParsedClient {
  name: string;
  email: string;
  location: string;
  contact_person: string;
  contact_person_phone: string;
  contact_person_email: string;
  contact_person_role: string;
  category: string;
  mode_of_connection: string;
  product: string;
  interest_scale: number;
}

export function parseCsv(text: string): ParsedClient[] {
  const lines = text.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const results: ParsedClient[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });

    results.push({
      name: row.name || row.client_name || row.company || "",
      email: row.email || "",
      location: row.location || row.address || "",
      contact_person: row.contact_person || row.contact || row.person || "",
      contact_person_phone: row.contact_person_phone || row.phone || row.contact_phone || "",
      contact_person_email: row.contact_person_email || row.contact_email || "",
      contact_person_role: row.contact_person_role || row.role || row.title || "",
      category: row.category || row.type || "",
      mode_of_connection: row.mode_of_connection || row.mode || row.connection || "",
      product: row.product || row.product_name || "",
      interest_scale: parseFloat(row.interest_scale || row.interest || "5") || 5,
    });
  }

  return results;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/csv-parser.ts
git commit -m "feat: add CSV parser for bulk client import"
```

---

## Task 13: CSV Import — Wizard Component

**Files:**
- Create: `src/components/csv-import-wizard.tsx`

**Interfaces:**
- Consumes: parseCsv from `src/lib/csv-parser.ts`, supabase client
- Produces: Multi-step import wizard UI

- [ ] **Step 1: Create CsvImportWizard component**

This is a large component with these steps:
1. File upload (drag & drop or click)
2. AI processes CSV, shows extracted count
3. Step-through review (one client card at a time, editable form)
4. Confirmation + save

Key implementation:
```tsx
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { parseCsv, type ParsedClient } from "@/lib/csv-parser";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, ChevronLeft, ChevronRight, Check } from "lucide-react";

interface CsvImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function CsvImportWizard({ open, onOpenChange, onComplete }: CsvImportWizardProps) {
  const { u } = useAuth();
  const [step, setStep] = useState<"upload" | "processing" | "review" | "confirm">("upload");
  const [csvData, setCsvData] = useState<ParsedClient[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedClient, setEditedClient] = useState<ParsedClient | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [stageNotes, setStageNotes] = useState("");
  const [stageValue, setStageValue] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    setStep("processing");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        toast.error("No valid client data found in CSV");
        setStep("upload");
        return;
      }
      setCsvData(parsed);
      setEditedClient({ ...parsed[0] });
      setStep("review");
    };
    reader.readAsText(file);
  };

  const handleSaveCurrent = async () => {
    if (!editedClient || !u?.user) return;
    const { error } = await supabase.from("clients").insert({
      name: editedClient.name,
      email: editedClient.email || null,
      location: editedClient.location || null,
      contact_person: editedClient.contact_person || null,
      contact_person_phone: editedClient.contact_person_phone || null,
      contact_person_email: editedClient.contact_person_email || null,
      contact_person_role: editedClient.contact_person_role || null,
      category: editedClient.category || "Other",
      mode_of_connection: editedClient.mode_of_connection || "Other",
      product: editedClient.product || null,
      interest_scale: editedClient.interest_scale,
      current_stage: 1,
      stage_value: stageValue,
      stage_notes: stageNotes || null,
      created_by: u.user.id,
    });
    if (error) {
      toast.error(`Failed to save ${editedClient.name}: ${error.message}`);
      return false;
    }
    setSavedCount(prev => prev + 1);
    return true;
  };

  const handleNext = async () => {
    const saved = await handleSaveCurrent();
    if (!saved) return;
    if (currentIndex < csvData.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setEditedClient({ ...csvData[currentIndex + 1] });
      setStageNotes("");
      setStageValue(1);
    } else {
      setStep("confirm");
      toast.success(`All ${savedCount + 1} clients saved!`);
    }
  };

  const handleSaveAll = async () => {
    let count = 0;
    for (let i = currentIndex; i < csvData.length; i++) {
      setEditedClient({ ...csvData[i] });
      const saved = await handleSaveCurrent();
      if (saved) count++;
    }
    setSavedCount(prev => prev + count);
    setStep("confirm");
    toast.success(`All ${savedCount + count} clients saved!`);
  };

  const handleComplete = () => {
    onComplete();
    onOpenChange(false);
    setStep("upload");
    setCsvData([]);
    setCurrentIndex(0);
    setSavedCount(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Clients from CSV</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a CSV file with client data. Required column: name. 
              You can use AI tools like ChatGPT, Claude etc to convert other file formats to CSV.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm">Click to upload CSV</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </div>
        )}

        {step === "processing" && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Processing CSV...</p>
          </div>
        )}

        {step === "review" && editedClient && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Client {currentIndex + 1} of {csvData.length} — Review and edit below
            </p>
            {/* Editable form fields for the current client */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={editedClient.name} onChange={e => setEditedClient({ ...editedClient, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={editedClient.email} onChange={e => setEditedClient({ ...editedClient, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Location</Label>
                <Input value={editedClient.location} onChange={e => setEditedClient({ ...editedClient, location: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Contact Person</Label>
                <Input value={editedClient.contact_person} onChange={e => setEditedClient({ ...editedClient, contact_person: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Contact Phone</Label>
                <Input value={editedClient.contact_person_phone} onChange={e => setEditedClient({ ...editedClient, contact_person_phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Contact Role</Label>
                <Input value={editedClient.contact_person_role} onChange={e => setEditedClient({ ...editedClient, contact_person_role: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Category</Label>
                <Input value={editedClient.category} onChange={e => setEditedClient({ ...editedClient, category: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Product</Label>
                <Input value={editedClient.product} onChange={e => setEditedClient({ ...editedClient, product: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Interest Scale: {editedClient.interest_scale.toFixed(1)}</Label>
              <Slider min={1} max={10} step={0.1} value={[editedClient.interest_scale]}
                onValueChange={([v]) => setEditedClient({ ...editedClient, interest_scale: v })} />
            </div>
            <div className="space-y-1">
              <Label>Stage Notes (required)</Label>
              <Input value={stageNotes} onChange={e => setStageNotes(e.target.value)}
                placeholder="Why is this client at this stage?" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleNext} disabled={!editedClient.name || !stageNotes}>
                {currentIndex < csvData.length - 1 ? "Save & Next" : "Save & Finish"}
              </Button>
              <Button variant="outline" onClick={handleSaveAll}>Save All Remaining</Button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="text-center py-8 space-y-4">
            <Check className="h-12 w-12 mx-auto text-green-600" />
            <p className="text-lg font-medium">{savedCount} clients imported successfully!</p>
            <Button onClick={handleComplete}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/csv-import-wizard.tsx
git commit -m "feat: add CSV import wizard component"
```

---

## Task 14: CSV Import — Add Buttons to UI

**Files:**
- Modify: `src/components/ai-assistant-drawer.tsx` (add Import CSV button)
- Modify: `src/routes/_authenticated/clients.new.tsx` (add Import CSV button)

**Interfaces:**
- Consumes: CsvImportWizard from `src/components/csv-import-wizard.tsx`
- Produces: Import CSV buttons in drawer and new client page

- [ ] **Step 1: Add Import CSV button to AI drawer**

In the AI assistant drawer, add a button that opens the CsvImportWizard:
```tsx
import { CsvImportWizard } from "@/components/csv-import-wizard";

// Add state:
const [csvImportOpen, setCsvImportOpen] = useState(false);

// Add button in the drawer header or quick actions:
<Button variant="outline" size="sm" onClick={() => setCsvImportOpen(true)}>
  Import CSV
</Button>

// Add wizard component:
<CsvImportWizard open={csvImportOpen} onOpenChange={setCsvImportOpen} onComplete={() => {}} />
```

- [ ] **Step 2: Add Import CSV button to new client page**

In `clients.new.tsx`, add:
```tsx
import { CsvImportWizard } from "@/components/csv-import-wizard";

const [csvImportOpen, setCsvImportOpen] = useState(false);

// Add button near the top of the form:
<Button variant="outline" type="button" onClick={() => setCsvImportOpen(true)}>
  Import CSV
</Button>

<CsvImportWizard open={csvImportOpen} onOpenChange={setCsvImportOpen} onComplete={() => {}} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-assistant-drawer.tsx src/routes/_authenticated/clients.new.tsx
git commit -m "feat: add Import CSV buttons to AI drawer and new client page"
```

---

## Task 15: Final Integration — Fetch interest_scale in Analytics

**Files:**
- Modify: `src/hooks/use-analytics-data.ts`

**Interfaces:**
- Consumes: clients.interest_scale column
- Produces: interest_scale available in analytics data

- [ ] **Step 1: Add interest_scale to query**

In the supabase query that fetches clients, add `interest_scale` to the select:
```typescript
.select("*, interest_scale")
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-analytics-data.ts
git commit -m "feat: include interest_scale in analytics data fetch"
```

---

## Summary

| Task | Feature | Status |
|------|---------|--------|
| 1 | DB Migrations | Pending |
| 2 | Contact Phone Fix — Save | Pending |
| 3 | Contact Phone Fix — Display | Pending |
| 4 | Interest Scale — New Client Form | Pending |
| 5 | Interest Scale — Dashboard | Pending |
| 6 | AI Stage Fallback Popup | Pending |
| 7 | Follow-Up Service Layer | Pending |
| 8 | Follow-Up — StageUpdateDialog | Pending |
| 9 | Follow-Up — Client Detail | Pending |
| 10 | Follow-Up — Notification Bell | Pending |
| 11 | Follow-Up — Browser Notifications | Pending |
| 12 | CSV Import — Parser | Pending |
| 13 | CSV Import — Wizard | Pending |
| 14 | CSV Import — Buttons | Pending |
| 15 | Analytics — Fetch Interest Scale | Pending |

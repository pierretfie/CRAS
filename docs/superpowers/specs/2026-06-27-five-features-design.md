# Design Spec: 5 CRM Features

## Feature 1: AI Stage Classification with Manual Fallback

### Problem
When AI is unavailable (error or timeout), the StageUpdateDialog has no way to classify stage value. Currently it just defaults to 0 or shows manual buttons.

### Design
- **Normal flow**: AI auto-classifies stage value (On Track/At Risk) based on the user's description
- **Fallback flow**: When AI fails (HTTP error or 2-min timeout), show a popup asking "Is this going well?" with green (On Track) / red (At Risk) options
- **Detection**: Two mechanisms: (1) HTTP error from AI endpoint, (2) 2-minute timeout without response
- **Timeout UI**: "AI is taking long to respond" with three options: "Retry" (re-call AI), "Do manual edits" (show popup), "Cancel"
- **AI success**: If AI responds successfully, skip popup entirely, proceed with AI's classification

### Files
- `src/routes/_authenticated/clients.$id.tsx` — StageUpdateDialog
- `src/lib/api/ai.functions.ts` — AI stage classification endpoint

---

## Feature 2: Contact Phone Visibility (Bug Fix)

### Problem
The `contact_person_phone`, `contact_person_email`, and `contact_person_role` fields exist in the database but:
1. Are NOT saved when creating a new client (form collects them but insert query omits them)
2. Are NOT displayed on the client dashboard

### Design
- Add missing fields to the `supabase.from("clients").insert(...)` call in `clients.new.tsx`
- Display all three fields in the client detail page's Details card
- Add them to the EditClientDialog for editing

### Files
- `src/routes/_authenticated/clients.new.tsx` — save function
- `src/routes/_authenticated/clients.$id.tsx` — Detail component, EditClientDialog

---

## Feature 3: Interest Scale (1-10 Slider)

### Problem
No way to track client interest level. Need a decimal-friendly scale (e.g., 3.6, 8.5) that coexists with stage value.

### Design
- **New DB column**: `interest_scale` (DECIMAL(3,1)) on `clients` table, default 5.0
- **UI**: Slider component (shadcn Slider) with min=1, max=10, step=0.1
- **Coexistence**: Interest scale tracks engagement level, stage value tracks risk. Two separate metrics
- **Display locations**: New client form, client detail page, StageUpdateDialog
- **Analytics**: Interest scale can be used to track progress and product interests over time

### DB Migration
```sql
ALTER TABLE clients ADD COLUMN interest_scale DECIMAL(3,1) NOT NULL DEFAULT 5.0;
```

### Files
- `supabase/migrations/` — new migration
- `src/routes/_authenticated/clients.new.tsx` — slider in form
- `src/routes/_authenticated/clients.$id.tsx` — display in detail, slider in update dialog
- `src/hooks/use-analytics-data.ts` — fetch interest_scale

---

## Feature 4: Follow-Up System with Reminders

### Problem
No way to track follow-ups with clients. Users need daily reminders and an in-app notification system.

### Design

#### New DB Table
```sql
CREATE TABLE client_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily, every_2_days, weekly, custom
  custom_interval_days INT, -- for custom frequency
  note TEXT,
  next_reminder TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### RLS Policy
- Users can only see/manage follow-ups they created
- Admin can see all follow-ups

#### UI Locations
1. **StageUpdateDialog**: Toggle "Set follow-up?" with optional note and frequency selector
2. **Client detail page**: Dedicated "Follow Up" section with status, next reminder, cancel button
3. **Notification panel**: New bell icon in top nav showing pending follow-ups

#### Frequency
- Configurable: daily, every 2 days, weekly, custom (user picks interval in days)
- AI suggests frequency based on interest level and stage (e.g., high interest = weekly, low interest = daily)

#### Notifications
- **In-app**: Bell icon with count badge, dropdown showing pending follow-ups
- **Browser**: Use Notification API for push notifications
- **Background check**: On app load, check for overdue follow-ups and show notifications

#### End Follow-Up
- Automatic: When moving stage, client lost/won
- Manual: From client detail page or notification panel

### Files
- `supabase/migrations/` — new migration for `client_follow_ups` table
- `src/routes/_authenticated/clients.$id.tsx` — follow-up section
- `src/routes/_authenticated/clients.$id.tsx` — StageUpdateDialog follow-up toggle
- `src/components/follow-up-notifications.tsx` — new notification bell component
- `src/routes/_authenticated/route.tsx` — integrate notification bell in nav

---

## Feature 5: CSV Bulk Client Import

### Problem
Users may have 10+ clients from marketing events. Need to import from CSV with AI extraction and step-through review.

### Design

#### File Format
- CSV only (with user note: "You can use AI tools like ChatGPT, Claude etc to convert other file formats to CSV")
- Expected columns: name, email, location, contact_person, contact_person_phone, contact_person_email, contact_person_role, category, mode_of_connection, product, interest_scale

#### Flow
1. User clicks "Import CSV" in AI drawer or new client page
2. Upload CSV file
3. AI parses CSV rows, extracts client data
4. Step-through review: one client card at a time
   - Show extracted data in editable form
   - AI flags missing required fields (stage, description) and asks user
   - User edits, confirms, moves to next
5. Bulk save all confirmed clients

#### AI Extraction
- Parse CSV columns → map to client fields
- AI fills missing fields where possible (e.g., infer category from name)
- AI requests user input for: stage value, description, follow-up preference

#### UI
- New component: `CsvImportWizard` (multi-step dialog)
- Step 1: Upload CSV
- Step 2: AI processes, shows extracted count
- Step 3: Step-through review (one card per client)
- Step 4: Confirmation + save

### Files
- `src/components/csv-import-wizard.tsx` — new component
- `src/components/ai-assistant-drawer.tsx` — add "Import CSV" button
- `src/routes/_authenticated/clients.new.tsx` — add "Import CSV" button
- `src/lib/api/ai.functions.ts` — CSV parsing/extraction logic

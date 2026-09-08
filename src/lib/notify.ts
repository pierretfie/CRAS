/**
 * Client-side notification helpers.
 *
 * Broadcasts are sent to every admin — we query user_roles for admin IDs
 * then insert one notification row per admin. The current user's own action
 * is included so they also see it in their feed.
 */
import { supabase } from "@/integrations/supabase/client";
import { query } from "@/lib/db";

export type NotificationType = "new_client" | "stage_progress" | "client_won" | "client_lost";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  client_id: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getCurrentCompanyId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const res = await query("select company_id from profiles where id = $1", [user.id]);
  const row = (res.data as any[])?.[0];
  return row?.company_id ?? null;
}

async function getAdminUserIds(companyId: string | null): Promise<string[]> {
  if (companyId) {
    const res = await query("select user_id from user_roles where role = 'admin' and company_id = $1", [companyId], companyId);
    if (res.error) { console.error("[notify] failed to fetch admins", res.error); return []; }
    return ((res.data as any[]) ?? []).map((r: { user_id: string }) => r.user_id);
  }
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  if (error) { console.error("[notify] failed to fetch admins", error); return []; }
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

async function broadcastToAdmins(
  type: NotificationType,
  title: string,
  body: string,
  clientId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) { console.warn("[notify] no company_id, skipping broadcast"); return; }
  const adminIds = await getAdminUserIds(companyId);
  if (adminIds.length === 0) return;

  // Use query() so self-hosted (deities) routes to external DB via getPool(companyId)
  // and satisfies RLS `company_id = my_company_id()` + NOT NULL (supabase/migrations 20260702000001)
  for (const user_id of adminIds) {
    const res = await query(
      `insert into notifications (user_id, company_id, type, title, body, client_id, payload)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [user_id, companyId, type, title, body, clientId, JSON.stringify(payload)],
      companyId,
    );
    if (res.error) console.error("[notify] insert failed", res.error);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function notifyNewClient(
  clientId: string,
  clientName: string,
  createdByName: string,
  product: string | null,
  stage: number
): Promise<void> {
  await broadcastToAdmins(
    "new_client",
    "New client added",
    `${createdByName} added "${clientName}"${product ? ` · ${product}` : ""} at Stage ${stage}`,
    clientId,
    { clientName, createdByName, product, stage }
  );
}

export async function notifyStageProgress(
  clientId: string,
  clientName: string,
  fromStage: number,
  toStage: number,
  updatedByName: string
): Promise<void> {
  await broadcastToAdmins(
    "stage_progress",
    "Client progressed",
    `${clientName} moved from Stage ${fromStage} → Stage ${toStage} (by ${updatedByName})`,
    clientId,
    { clientName, fromStage, toStage, updatedByName }
  );
}

export async function notifyClientWon(
  clientId: string,
  clientName: string,
  closedByName: string,
  product: string | null
): Promise<void> {
  await broadcastToAdmins(
    "client_won",
    "🏆 Client won!",
    `${clientName}${product ? ` (${product})` : ""} marked as won by ${closedByName}`,
    clientId,
    { clientName, closedByName, product }
  );
}

export async function notifyClientLost(
  clientId: string,
  clientName: string,
  reason: string,
  closedByName: string
): Promise<void> {
  await broadcastToAdmins(
    "client_lost",
    "Client lost",
    `${clientName} marked as lost · ${reason} (by ${closedByName})`,
    clientId,
    { clientName, reason, closedByName }
  );
}

export async function notifyAccessRequest(
  clientId: string,
  clientName: string,
  ownerId: string,
  requesterName: string,
  requestId: string,
  message: string | null
): Promise<void> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return;
  const res = await query(
    `insert into notifications (user_id, company_id, type, title, body, client_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [ownerId, companyId, "access_request", "Access request", `${requesterName} is requesting access to "${clientName}"${message ? `: "${message}"` : ""}`, clientId, JSON.stringify({ requestId, requesterName, clientName })],
    companyId,
  );
  if (res.error) console.error("[notify] access request failed", res.error);
}

export async function notifyAccessResponse(
  requesterId: string,
  clientId: string,
  clientName: string,
  approved: boolean,
  ownerName: string
): Promise<void> {
  const companyId = await getCurrentCompanyId();
  if (!companyId) return;
  const res = await query(
    `insert into notifications (user_id, company_id, type, title, body, client_id, payload)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [requesterId, companyId, approved ? "access_approved" : "access_rejected", approved ? "Access granted" : "Access denied", approved ? `${ownerName} approved your request to access "${clientName}"` : `${ownerName} declined your request to access "${clientName}"`, approved ? clientId : null, JSON.stringify({ clientName, ownerName, approved })],
    companyId,
  );
  if (res.error) console.error("[notify] access response failed", res.error);
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from("notifications").update({ read: true }).eq("id", id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
}

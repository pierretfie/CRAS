/**
 * Client-side notification helpers.
 *
 * Broadcasts are sent to every admin — we query user_roles for admin IDs
 * then insert one notification row per admin. The current user's own action
 * is included so they also see it in their feed.
 */
import { supabase } from "@/integrations/supabase/client";

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

async function getAdminUserIds(): Promise<string[]> {
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
  const adminIds = await getAdminUserIds();
  if (adminIds.length === 0) return;

  const rows = adminIds.map((user_id) => ({
    user_id,
    type,
    title,
    body,
    client_id: clientId,
    payload,
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[notify] insert failed", error);
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
  const { error } = await supabase.from("notifications").insert({
    user_id: ownerId,
    type: "access_request",
    title: "Access request",
    body: `${requesterName} is requesting access to "${clientName}"${message ? `: "${message}"` : ""}`,
    client_id: clientId,
    payload: { requestId, requesterName, clientName },
  });
  if (error) console.error("[notify] access request failed", error);
}

export async function notifyAccessResponse(
  requesterId: string,
  clientId: string,
  clientName: string,
  approved: boolean,
  ownerName: string
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: requesterId,
    type: approved ? "access_approved" : "access_rejected",
    title: approved ? "Access granted" : "Access denied",
    body: approved
      ? `${ownerName} approved your request to access "${clientName}"`
      : `${ownerName} declined your request to access "${clientName}"`,
    client_id: approved ? clientId : null,
    payload: { clientName, ownerName, approved },
  });
  if (error) console.error("[notify] access response failed", error);
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

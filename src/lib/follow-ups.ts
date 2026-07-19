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

// ── Display helpers ───────────────────────────────────────────────────────────

/** Format a date as "today", "yesterday", or a locale date string */
function relativeDay(date: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d.getTime() === todayStart.getTime()) return "today";
  if (d.getTime() === yesterdayStart.getTime()) return "yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Format a datetime with time if it's not exactly midnight */
function formatWithTime(iso: string): string {
  const d = new Date(iso);
  const hasMeaningfulTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  if (hasMeaningfulTime) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Returns a human-friendly status line for a follow-up.
 *
 * Overdue:  "Overdue — should have contacted Client by Jun 29 at 9:00 AM"
 * Due today: "Follow up with this client today"
 * Upcoming:  "Follow up with this client before Jun 30"
 * Logged:    "Followed up yesterday · next reminder Jun 30"
 */
export function followUpStatusText(
  nextReminder: string,
  lastLoggedAt: string | null,
  isLogged: boolean,
): { overdue: boolean; text: string; loggedText: string | null } {
  const now = new Date();
  const reminder = new Date(nextReminder);
  const overdue = reminder < now;

  if (isLogged && lastLoggedAt) {
    const loggedOn = relativeDay(new Date(lastLoggedAt));
    const nextOn = reminder.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return {
      overdue: false,
      text: `Follow up before ${formatWithTime(nextReminder)}`,
      loggedText: `Followed up ${loggedOn} · next reminder ${nextOn}`,
    };
  }

  if (overdue) {
    return {
      overdue: true,
      text: `Overdue — should have contacted Client by ${formatWithTime(nextReminder)}`,
      loggedText: null,
    };
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reminderDay = new Date(reminder.getFullYear(), reminder.getMonth(), reminder.getDate());
  const isToday = reminderDay.getTime() === todayStart.getTime();

  return {
    overdue: false,
    text: isToday
      ? "Follow up with this client today"
      : `Follow up before ${formatWithTime(nextReminder)}`,
    loggedText: null,
  };
}

export interface FollowUpLog {
  id: string;
  follow_up_id: string;
  client_id: string;
  user_id: string;
  activity_type: string | null;
  note: string | null;
  logged_at: string;
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

/**
 * "Followed up today" — logs the contact and reschedules next_reminder
 * based on the follow-up's frequency. The follow-up stays active.
 */
export async function logFollowUp(followUp: FollowUp, activityType?: string | null): Promise<FollowUp> {
  const nextReminder = computeNextReminder(
    followUp.frequency,
    followUp.custom_interval_days ?? undefined
  );

  // Insert the log entry
  const { error: logError } = await supabase.from("follow_up_logs").insert({
    follow_up_id: followUp.id,
    client_id: followUp.client_id,
    user_id: followUp.user_id,
    activity_type: activityType ?? null,
    logged_at: new Date().toISOString(),
  });
  if (logError) throw logError;

  // Advance next_reminder
  const { data, error } = await supabase
    .from("client_follow_ups")
    .update({
      next_reminder: nextReminder.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", followUp.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch the check-in history for a specific client, newest first.
 */
export async function getFollowUpLogs(clientId: string): Promise<FollowUpLog[]> {
  const { data, error } = await supabase
    .from("follow_up_logs")
    .select("*")
    .eq("client_id", clientId)
    .order("logged_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * "Done" — the follow-up is fully complete. No more reminders.
 */
export async function completeFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_follow_ups")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * "Stop" — user no longer wants this recurring reminder.
 */
export async function cancelFollowUp(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_follow_ups")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function frequencyIntervalMs(frequency: string, customDays?: number | null): number {
  switch (frequency) {
    case "daily":        return 24 * 60 * 60 * 1000;
    case "every_2_days": return 2 * 24 * 60 * 60 * 1000;
    case "weekly":       return 7 * 24 * 60 * 60 * 1000;
    case "custom":       return (customDays || 1) * 24 * 60 * 60 * 1000;
    default:             return 24 * 60 * 60 * 1000;
  }
}

/**
 * Returns true if the follow-up has already been logged for the current cycle.
 * A cycle started at (next_reminder - interval). If any log exists since then, it's done.
 * Exception: if the follow-up is overdue (next_reminder is in the past), always return false
 * so the user can always log an overdue follow-up.
 */
export function isLoggedThisCycle(
  nextReminder: string,
  frequency: string,
  customDays: number | null,
  lastLoggedAt: string | null
): boolean {
  if (!lastLoggedAt) return false;
  // Overdue — the cycle has already expired, always allow logging
  if (new Date(nextReminder) < new Date()) return false;
  const intervalMs = frequencyIntervalMs(frequency, customDays);
  const cycleStart = new Date(nextReminder).getTime() - intervalMs;
  return new Date(lastLoggedAt).getTime() >= cycleStart;
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

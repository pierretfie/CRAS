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
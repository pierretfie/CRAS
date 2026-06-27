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
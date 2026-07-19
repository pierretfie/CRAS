import notificationSound from "@/assets/notification.wav";

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

function playNotificationSound() {
  try {
    const audio = new Audio(notificationSound);
    audio.volume = 0.5;
    audio.play().catch(() => {
      // Browser may block autoplay — silently ignore
    });
  } catch {
    // Ignore if Audio API unavailable
  }
}

// How long to wait before re-alerting for the same overdue follow-up (6 hours)
const REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Key used in localStorage to track last-notified timestamps per follow-up ID
const NOTIFIED_KEY = "cras-notified-followups";

type NotifiedMap = Record<string, number>; // id → last notified timestamp (ms)

function getNotifiedMap(): NotifiedMap {
  try {
    const raw = localStorage.getItem(NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveNotifiedMap(map: NotifiedMap) {
  try {
    // Prune entries older than the reminder interval to keep storage tidy
    const cutoff = Date.now() - REMINDER_INTERVAL_MS;
    const pruned: NotifiedMap = {};
    for (const [id, ts] of Object.entries(map)) {
      if (ts > cutoff) pruned[id] = ts;
    }
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(pruned));
  } catch {
    // Ignore storage errors
  }
}

export function checkOverdueFollowUps(
  followUps: { client_id: string; note: string | null; next_reminder: string }[]
) {
  const now = Date.now();
  const overdue = followUps.filter((f) => new Date(f.next_reminder).getTime() <= now);
  if (overdue.length === 0) return;

  // Stable ID per follow-up: client_id + reminder time.
  // Different next_reminder = new ID = fires again (correct for rescheduled reminders).
  const notifiedMap = getNotifiedMap();

  const newOnes = overdue.filter((f) => {
    const id = `${f.client_id}::${f.next_reminder}`;
    const lastNotified = notifiedMap[id] ?? 0;
    return now - lastNotified >= REMINDER_INTERVAL_MS;
  });

  if (newOnes.length === 0) return;

  sendNotification(
    "Follow-up Reminder",
    `You have ${newOnes.length} overdue follow-up${newOnes.length > 1 ? "s" : ""}. Check your CRM dashboard.`
  );
  playNotificationSound();

  // Record the current time as last-notified for each one that just fired
  for (const f of newOnes) {
    notifiedMap[`${f.client_id}::${f.next_reminder}`] = now;
  }
  saveNotifiedMap(notifiedMap);
}

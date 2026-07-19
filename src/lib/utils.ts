import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const POSITIVE = [
  "signed",
  "agreed",
  "confirmed",
  "onboarded",
  "paid",
  "contract",
  "closed",
  "deposit",
  "deal",
  "started",
  "active",
  "progressing",
  "interested",
  "demo done",
  "proposal accepted",
];

const NEGATIVE = ["unresponsive", "ghosted", "declined", "rejected", "lost", "no reply", "passed"];

export function classifyStageValue(stage: number, description: string): number {
  const d = description.toLowerCase();
  if (NEGATIVE.some((k) => d.includes(k))) return 0;
  if (POSITIVE.some((k) => d.includes(k))) return 1;
  // Default: any substantive description is positive progression
  if (d.length > 5) return 1;
  return 0;
}

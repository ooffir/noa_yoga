import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(time: string): string {
  return time;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

export function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function isWithinCancellationWindow(
  classDate: Date,
  classTime: string,
  hoursBeforeThreshold: number = 6
): boolean {
  const [hours, minutes] = classTime.split(":").map(Number);
  const classDateTime = new Date(classDate);
  classDateTime.setHours(hours, minutes, 0, 0);

  const now = new Date();
  const diffMs = classDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours >= hoursBeforeThreshold;
}

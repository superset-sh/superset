/**
 * Task Feature — Shared Helpers
 */

/** 이름에서 이니셜 추출 (최대 2글자) */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** 상대적 시간 표시 ("just now", "5m ago", "2h ago", "3d ago", "Mar 1") */
export function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(dateStr));
}

/** 날짜 문자열을 "Mar 1" 포맷으로 변환 (date-only 또는 ISO timestamp 모두 지원) */
export function formatShortDate(dateStr: string): string {
  // "2026-03-01" → append T00:00:00 to force local timezone
  // "2026-03-01T..." → already an ISO timestamp, use as-is
  const date = dateStr.includes("T")
    ? new Date(dateStr)
    : new Date(dateStr + "T00:00:00");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

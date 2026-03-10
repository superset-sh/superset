/**
 * Task Status Icon - Linear 스타일 SVG 기반 상태 아이콘
 */
import { cn } from "@superbuilder/feature-ui/lib/utils";
import type { TaskStatus } from "@superbuilder/drizzle";

interface Props {
  status: TaskStatus;
  className?: string;
  size?: number;
}

export function TaskStatusIcon({ status, className, size = 16 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn("shrink-0", className)}
    >
      {STATUS_SVG_MAP[status]}
    </svg>
  );
}

/* Constants */

const STATUS_SVG_MAP: Record<TaskStatus, React.ReactNode> = {
  backlog: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.5 2.5"
        className="text-muted-foreground"
      />
    </>
  ),
  todo: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-muted-foreground"
      />
    </>
  ),
  in_progress: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-amber-500"
      />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8H8V1.5Z"
        fill="currentColor"
        className="text-amber-500"
      />
    </>
  ),
  in_review: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-blue-500"
      />
      <path
        d="M8 1.5A6.5 6.5 0 0 1 14.5 8 6.5 6.5 0 0 1 8 14.5 6.5 6.5 0 0 1 1.5 8H8V1.5Z"
        fill="currentColor"
        className="text-blue-500"
      />
    </>
  ),
  done: (
    <>
      <circle cx="8" cy="8" r="7.25" fill="currentColor" className="text-purple-500" />
      <path
        d="M5.5 8L7.2 9.7L10.5 6.3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  canceled: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-muted-foreground"
      />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-muted-foreground"
      />
    </>
  ),
  duplicate: (
    <>
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-muted-foreground/60"
      />
      <path
        d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-muted-foreground/60"
      />
    </>
  ),
};

/* Helpers */

const STATUS_LABEL_MAP: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  canceled: "Canceled",
  duplicate: "Duplicate",
};

export function getStatusLabel(status: TaskStatus): string {
  return STATUS_LABEL_MAP[status];
}

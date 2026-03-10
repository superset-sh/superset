/**
 * Task Feature Constants
 *
 * @superbuilder/drizzle에서 값(value) import 시 NestJS가 브라우저 번들에 포함되어
 * process is not defined 에러가 발생하므로, 프론트엔드용 상수를 로컬에 정의
 */
import type { TaskStatus } from "@superbuilder/drizzle";

export type TaskStatusCategory =
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled";

export const STATUS_DISPLAY_ORDER: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
  "duplicate",
];

export const STATUS_CATEGORY_MAP: Record<TaskStatus, TaskStatusCategory> = {
  backlog: "backlog",
  todo: "unstarted",
  in_progress: "started",
  in_review: "started",
  done: "completed",
  canceled: "canceled",
  duplicate: "canceled",
};

export const PRIORITY_LABELS: Record<number, string> = {
  0: "None",
  1: "Urgent",
  2: "High",
  3: "Normal",
  4: "Low",
};

// ============================================================================
// Kanban Board
// ============================================================================

export type CardSize = "compact" | "full";

export type ViewMode = "list" | "board";

export type SortByField = "createdAt" | "updatedAt" | "priority" | "dueDate";

/** 칸반에서 기본 접힌 상태의 컬럼 */
export const COLLAPSED_BY_DEFAULT: TaskStatus[] = ["canceled", "duplicate"];


// ============================================================================
// Shared Filter State
// ============================================================================

export interface FilterState {
  statuses: TaskStatus[];
  priorities: number[];
  projectId: string | null;
  labelIds: string[];
}

// ============================================================================
// Shared Row / Card Data Types
// ============================================================================

export interface TaskRowData {
  id: string;
  identifier: string;
  title: string;
  status: TaskStatus;
  priority: number;
  dueDate?: string | null;
  assignee?: {
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
  labels?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export interface BoardCardData extends TaskRowData {
  description?: string | null;
  sortOrder: number;
}

/**
 * Task Activity Feed - 활동 + 댓글 통합 타임라인
 */
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@superbuilder/feature-ui/shadcn/avatar";
import {
  ArrowRight,
  CircleDot,
  Tag,
  User,
  FolderOpen,
  Clock,
  Type,
  FileText,
  GitBranch,
  Hash,
} from "lucide-react";
import { useTaskActivities, useTaskComments } from "../hooks";
import type { TaskStatus } from "@superbuilder/drizzle";
import { PRIORITY_LABELS } from "../constants";
import { getStatusLabel } from "./task-status-icon";
import { getInitials, formatShortDate, formatRelativeTime } from "../helpers";

interface Props {
  taskId: string;
}

export function TaskActivityFeed({ taskId }: Props) {
  const {
    data: activities,
    isLoading: activitiesLoading,
    error: activitiesError,
  } = useTaskActivities(taskId);
  const {
    data: comments,
    isLoading: commentsLoading,
    error: commentsError,
  } = useTaskComments(taskId);

  const isLoading = activitiesLoading || commentsLoading;

  // Merge activities and comments into a single timeline
  const timelineItems = buildTimeline(activities ?? [], comments ?? []);

  if (isLoading) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">Loading activity...</p>
      </div>
    );
  }

  if (activitiesError && commentsError) {
    return (
      <div className="py-4">
        <p className="text-sm text-destructive">Failed to load activity.</p>
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Activity</h3>
      <div className="flex flex-col gap-0">
        {timelineItems.map((item) => (
          <div key={item.id} className="flex gap-3 py-2">
            {/* Icon or Avatar */}
            <div className="shrink-0 pt-0.5">
              {item.type === "comment" ? (
                <Avatar className="size-6">
                  {item.authorAvatar ? (
                    <AvatarImage src={item.authorAvatar} alt={item.authorName} />
                  ) : null}
                  <AvatarFallback className="text-[10px]">
                    {getInitials(item.authorName)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <div className="flex size-6 items-center justify-center rounded-full bg-muted">
                  {getActivityIcon(item.action)}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {item.type === "comment" ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.authorName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{item.content}</p>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {getActivityDescription(item.action, item.fromValue, item.toValue)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Types */

interface TimelineItem {
  id: string;
  type: "activity" | "comment";
  createdAt: string;
  // Activity fields
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  // Comment fields
  content?: string;
  authorName: string;
  authorAvatar?: string | null;
}

/* Helpers */

function buildTimeline(
  activities: Array<{
    id: string;
    action: string;
    fromValue?: string | null;
    toValue?: string | null;
    createdAt: string;
    actor?: { name: string; avatar?: string | null } | null;
  }>,
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    author?: { name: string; avatar?: string | null } | null;
  }>,
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...activities
      .filter((a) => a.action !== "commented")
      .map((a) => ({
        id: a.id,
        type: "activity" as const,
        createdAt: a.createdAt,
        action: a.action,
        fromValue: a.fromValue,
        toValue: a.toValue,
        authorName: a.actor?.name ?? "System",
        authorAvatar: a.actor?.avatar,
      })),
    ...comments.map((c) => ({
      id: c.id,
      type: "comment" as const,
      createdAt: c.createdAt,
      action: "commented",
      content: c.content,
      authorName: c.author?.name ?? "Unknown",
      authorAvatar: c.author?.avatar,
    })),
  ];

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function getActivityIcon(action: string): React.ReactNode {
  const iconClass = "size-3 text-muted-foreground";
  switch (action) {
    case "created":
      return <CircleDot className={iconClass} />;
    case "status_changed":
      return <ArrowRight className={iconClass} />;
    case "priority_changed":
      return <Hash className={iconClass} />;
    case "assigned":
    case "unassigned":
      return <User className={iconClass} />;
    case "label_added":
    case "label_removed":
      return <Tag className={iconClass} />;
    case "project_changed":
      return <FolderOpen className={iconClass} />;
    case "cycle_changed":
      return <GitBranch className={iconClass} />;
    case "estimate_changed":
      return <Clock className={iconClass} />;
    case "due_date_changed":
      return <Clock className={iconClass} />;
    case "title_changed":
      return <Type className={iconClass} />;
    case "description_changed":
      return <FileText className={iconClass} />;
    default:
      return <CircleDot className={iconClass} />;
  }
}

function getActivityDescription(
  action: string,
  fromValue?: string | null,
  toValue?: string | null,
): string {
  switch (action) {
    case "created":
      return "created this task";
    case "status_changed":
      return `changed status from ${fromValue ? getStatusLabel(fromValue as TaskStatus) : "—"} to ${toValue ? getStatusLabel(toValue as TaskStatus) : "—"}`;
    case "priority_changed":
      return `changed priority from ${fromValue != null ? (PRIORITY_LABELS[Number(fromValue)] ?? fromValue) : "—"} to ${toValue != null ? (PRIORITY_LABELS[Number(toValue)] ?? toValue) : "—"}`;
    case "assigned":
      return `assigned to ${toValue ?? "someone"}`;
    case "unassigned":
      return `unassigned from ${fromValue ?? "someone"}`;
    case "label_added":
      return `added label ${toValue ?? ""}`;
    case "label_removed":
      return `removed label ${fromValue ?? ""}`;
    case "project_changed":
      return `moved to project ${toValue ?? "None"}`;
    case "cycle_changed":
      return `added to cycle ${toValue ?? "None"}`;
    case "estimate_changed":
      return `changed estimate from ${fromValue ?? "—"} to ${toValue ?? "—"}`;
    case "due_date_changed":
      return `changed due date to ${toValue ? formatShortDate(toValue) : "None"}`;
    case "title_changed":
      return "updated the title";
    case "description_changed":
      return "updated the description";
    case "parent_changed":
      return "changed parent task";
    default:
      return action.replace(/_/g, " ");
  }
}


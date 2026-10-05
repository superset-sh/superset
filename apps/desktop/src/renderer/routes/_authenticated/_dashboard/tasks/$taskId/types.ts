import type { TaskPriority } from "@superset/db/enums";
import type { SelectTask, SelectTaskStatus } from "@superset/db/schema";
import type { RouterOutputs } from "@superset/trpc";
import type { RecordLabel } from "renderer/routes/_authenticated/_dashboard/components/RecordLabels";
import type { TimelineActorValue } from "renderer/routes/_authenticated/_dashboard/components/TimelineActor";
import type { TaskAssignee } from "../components/TasksView/hooks/useTasksData";

export type TaskTimeline = RouterOutputs["taskRecord"]["timeline"];
export type TaskComment = TaskTimeline["comments"][number];
type Change = TaskTimeline["changes"][number];
type TaskStatusValue = NonNullable<NonNullable<Change["status"]>["to"]>;
export type TaskPerson = NonNullable<NonNullable<Change["assignee"]>["to"]>;
export type TaskProjectValue = NonNullable<
	NonNullable<Change["project"]>["to"]
>;

export interface TaskCommentThread {
	root: TaskComment;
	replies: TaskComment[];
}

export type TaskTimelineEvent = {
	id: string;
	at: Date;
	actor: TimelineActorValue;
} & (
	| { kind: "created"; importedFrom: string | null }
	| { kind: "renamed"; from: string; to: string }
	| { kind: "description_edited" }
	| { kind: "label_added" | "label_removed"; label: RecordLabel }
	| { kind: "status"; from: TaskStatusValue | null; to: TaskStatusValue | null }
	| { kind: "priority"; from: TaskPriority | null; to: TaskPriority }
	| { kind: "assignee"; from: TaskPerson | null; to: TaskPerson | null }
	| {
			kind: "project";
			from: TaskProjectValue | null;
			to: TaskProjectValue | null;
	  }
	| {
			kind: "workspace_linked" | "workspace_unlinked";
			workspace: { id: string; name: string };
	  }
);

export interface NewTaskComment {
	body: string;
	parentCommentId?: string;
}

export type TaskTimelineItem =
	| { kind: "event"; event: TaskTimelineEvent }
	| { kind: "thread"; thread: TaskCommentThread };

export type TaskRecord = SelectTask & {
	status: SelectTaskStatus;
	assignee: TaskAssignee | null;
	creator: TaskAssignee | null;
};

import { useLingui } from "@lingui/react/macro";
import type {
	NewTaskComment,
	TaskPerson,
	TaskTimelineItem,
} from "../../../../types";
import { TaskCommentComposer } from "./components/TaskCommentComposer";
import { TaskCommentThread } from "./components/TaskCommentThread";
import { TaskTimelineEvent } from "./components/TaskTimelineEvent";

interface TaskTimelineProps {
	items: TaskTimelineItem[];
	now: Date;
	currentUser: TaskPerson | null;
	onOpenPerson: (userId: string) => void;
	onOpenProject: (projectId: string) => void;
	onOpenWorkspace: (workspaceId: string) => void;
	onAddComment: (comment: NewTaskComment) => Promise<void>;
	onEditComment: (commentId: string, body: string) => Promise<void>;
	onDeleteComment: (commentId: string) => void;
}

export function TaskTimeline({
	items,
	now,
	currentUser,
	onOpenPerson,
	onOpenProject,
	onOpenWorkspace,
	onAddComment,
	onEditComment,
	onDeleteComment,
}: TaskTimelineProps) {
	const { t } = useLingui();
	return (
		<div>
			{items.map((item, index) => {
				const next = items[index + 1];
				if (item.kind === "thread") {
					return (
						<TaskCommentThread
							key={item.thread.root.id}
							thread={item.thread}
							now={now}
							currentUser={currentUser}
							onOpenPerson={onOpenPerson}
							onReply={
								item.thread.root.id.startsWith("pending:")
									? undefined
									: (body) =>
											onAddComment({
												body,
												parentCommentId: item.thread.root.id,
											})
							}
							onEditComment={onEditComment}
							onDeleteComment={onDeleteComment}
						/>
					);
				}
				return (
					<div key={item.event.id} className="pl-[13px]">
						<TaskTimelineEvent
							event={item.event}
							isLast={!next || next.kind === "thread"}
							now={now}
							onOpenPerson={onOpenPerson}
							onOpenProject={onOpenProject}
							onOpenWorkspace={onOpenWorkspace}
						/>
					</div>
				);
			})}
			<TaskCommentComposer
				placeholder={t({ message: "Leave a comment…" })}
				submitLabel={t({ message: "Comment" })}
				className="mt-1"
				onSubmit={(body) => onAddComment({ body })}
			/>
		</div>
	);
}

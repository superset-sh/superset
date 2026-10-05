import { useLingui } from "@lingui/react/macro";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import type {
	TaskPerson,
	TaskCommentThread as Thread,
} from "../../../../../../types";
import { TaskCommentComposer } from "../TaskCommentComposer";
import { TaskComment } from "./components/TaskComment";

interface TaskCommentThreadProps {
	thread: Thread;
	now: Date;
	currentUser: TaskPerson | null;
	onOpenPerson: (userId: string) => void;
	onReply?: (body: string) => Promise<void>;
	onEditComment: (commentId: string, body: string) => Promise<void>;
	onDeleteComment: (commentId: string) => void;
}

export function TaskCommentThread({
	thread,
	now,
	currentUser,
	onOpenPerson,
	onReply,
	onEditComment,
	onDeleteComment,
}: TaskCommentThreadProps) {
	const { t } = useLingui();
	const comments = [thread.root, ...thread.replies];
	return (
		<div className="mb-5 rounded-lg border border-border bg-card/60">
			<div className="space-y-4 px-3 pt-3 pb-3">
				{comments.map((comment) => (
					<TaskComment
						key={comment.id}
						comment={comment}
						now={now}
						isOwn={
							currentUser !== null &&
							comment.author?.userId === currentUser.userId
						}
						hasReplies={
							comment.id === thread.root.id && thread.replies.length > 0
						}
						onOpenPerson={onOpenPerson}
						onEdit={(body) => onEditComment(comment.id, body)}
						onDelete={() => onDeleteComment(comment.id)}
					/>
				))}
			</div>
			{onReply && (
				<div className="border-t border-border px-3 py-2">
					<TaskCommentComposer
						placeholder={t({ message: "Leave a reply…" })}
						submitLabel={t({ message: "Reply" })}
						className="border-0 bg-transparent px-0 pt-0 pb-0"
						leading={
							<span className="flex h-6 w-8 shrink-0 items-center justify-center">
								{currentUser && (
									<AvatarStack
										people={[
											{
												id: currentUser.userId,
												name: currentUser.name,
												image: currentUser.image,
											},
										]}
										size={20}
									/>
								)}
							</span>
						}
						onSubmit={onReply}
					/>
				</div>
			)}
		</div>
	);
}

import { LuFileCode2, LuMessageSquare } from "react-icons/lu";
import type { CommentGroup } from "../../utils/groupComments";
import { ReviewCommentCard } from "../ReviewCommentCard";

interface ReviewCommentGroupProps {
	group: CommentGroup;
	highlightCommentId?: string | null;
}

export function ReviewCommentGroup({
	group,
	highlightCommentId,
}: ReviewCommentGroupProps) {
	const isGeneral = group.path === null;
	const headerText = group.path ?? "General";
	const HeaderIcon = isGeneral ? LuMessageSquare : LuFileCode2;

	return (
		<div className="border-b last:border-b-0">
			{/* Header */}
			<div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
				<HeaderIcon className="size-3.5 shrink-0 text-muted-foreground" />
				<h3 className="flex-1 truncate font-mono text-xs font-medium text-muted-foreground">
					{headerText}
				</h3>
				<span className="shrink-0 text-xs text-muted-foreground">
					{group.comments.length}
				</span>
			</div>

			{/* Comment list */}
			<div>
				{group.comments.map((comment) => (
					<ReviewCommentCard
						key={comment.id}
						comment={comment}
						isHighlighted={highlightCommentId === comment.id}
					/>
				))}
			</div>
		</div>
	);
}

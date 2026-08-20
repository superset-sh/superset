import { LuArrowUpRight } from "react-icons/lu";
import type { ReviewComment } from "../../../../../../types/review";
import { ReviewCommentRow } from "./components/ReviewCommentRow";

interface ReviewCommentsSectionProps {
	comments: ReviewComment[];
}

export function ReviewCommentsSection({
	comments,
}: ReviewCommentsSectionProps) {
	if (comments.length === 0) return null;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-sm font-medium">
					Comments
					<span className="flex size-4 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
						{comments.length}
					</span>
				</span>
				<button
					type="button"
					disabled
					className="text-muted-foreground/60"
					aria-label="Expand comments"
				>
					<LuArrowUpRight className="size-4" />
				</button>
			</div>
			<div className="flex flex-col gap-2">
				{comments.map((comment) => (
					<ReviewCommentRow key={comment.id} comment={comment} />
				))}
			</div>
		</div>
	);
}

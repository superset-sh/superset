import { memo } from "react";
import type { CommentPaneData } from "../../../../../../types";
import type { NormalizedComment, NormalizedPR } from "../../types";
import { ChecksSection } from "../ChecksSection";
import { CommentsSection } from "../CommentsSection";
import { PRHeader } from "../PRHeader";

interface ReviewTabContentProps {
	pr: NormalizedPR | null;
	comments: NormalizedComment[];
	isLoading: boolean;
	isError: boolean;
	isCommentsLoading: boolean;
	onOpenComment?: (comment: CommentPaneData) => void;
}

export const ReviewTabContent = memo(function ReviewTabContent({
	pr,
	comments,
	isLoading,
	isError,
	isCommentsLoading,
	onOpenComment,
}: ReviewTabContentProps) {
	if (isError) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
				Unable to load review status
			</div>
		);
	}

	if (isLoading && !pr) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading review...
			</div>
		);
	}

	if (!pr) {
		return (
			<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
				Open a pull request to view review status, checks, and comments.
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto">
			<PRHeader pr={pr} />

			<div className="my-1 border-b border-border/70" />

			<ChecksSection
				checks={pr.checks}
				checksStatus={pr.checksStatus}
				prUrl={pr.url}
			/>

			<div className="my-1 border-b border-border/70" />

			<CommentsSection
				comments={comments}
				isLoading={isCommentsLoading}
				onOpenComment={onOpenComment}
			/>
		</div>
	);
});

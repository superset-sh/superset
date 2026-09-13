import { Trans } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import type { NormalizedComment } from "../../../../../../components/CommentsSection/types";
import { PullRequestCommentCard } from "../PullRequestCommentCard";
import type { PullRequestCommentCardProps } from "../PullRequestCommentCard/PullRequestCommentCard";

interface PullRequestCommentsProps
	extends Omit<PullRequestCommentCardProps, "comment"> {
	comments: NormalizedComment[];
	isLoading: boolean;
	isError: boolean;
}
export function PullRequestComments({
	comments,
	isLoading,
	isError,
	...props
}: PullRequestCommentsProps) {
	const active = comments.filter((c) => !c.isResolved);
	const resolved = comments.filter((c) => c.isResolved);
	return (
		<section className="min-w-0 border-t border-border pt-6" data-pr-comments>
			<h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
				<Trans>Comments</Trans>
				<span className="text-xs font-normal tabular-nums text-muted-foreground">
					{comments.length}
				</span>
			</h2>
			<div className="w-full divide-y divide-border/60">
				{isError ? (
					<p className="py-6 text-sm text-destructive">
						<Trans>Unable to load review status</Trans>
					</p>
				) : isLoading ? (
					<>
						<Skeleton className="h-44 w-full rounded-lg" />
						<Skeleton className="h-44 w-full rounded-lg" />
					</>
				) : active.length ? (
					active.map((comment) => (
						<PullRequestCommentCard
							key={comment.id}
							comment={comment}
							{...props}
						/>
					))
				) : (
					<p className="py-8 text-center text-sm text-muted-foreground">
						<Trans>No comments yet.</Trans>
					</p>
				)}
				{resolved.length ? (
					<details className="group">
						<summary className="cursor-pointer py-2 text-xs font-medium text-muted-foreground">
							<Trans>Resolved</Trans>
							<span className="ml-2 tabular-nums">{resolved.length}</span>
						</summary>
						<div className="divide-y divide-border/60 pt-4">
							{resolved.map((comment) => (
								<PullRequestCommentCard
									key={comment.id}
									comment={comment}
									{...props}
								/>
							))}
						</div>
					</details>
				) : null}
			</div>
		</section>
	);
}

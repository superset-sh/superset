import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Skeleton } from "@superset/ui/skeleton";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useMemo } from "react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import { PullRequestActivityLayoutProvider } from "../../providers/PullRequestActivityLayoutProvider";
import { PullRequestActivityReplyProvider } from "../../providers/PullRequestActivityReplyProvider";
import { PullRequestActivityAvatar } from "../PullRequestActivityAvatar";
import {
	type PullRequestCommentTarget,
	PullRequestConversationComposer,
} from "../PullRequestConversationComposer";
import { PullRequestActivityComment } from "./components/PullRequestActivityComment";
import { PullRequestCommitRun } from "./components/PullRequestCommitRun";
import { PullRequestReviewEvent } from "./components/PullRequestReviewEvent";
import { PullRequestTimelineStop } from "./components/PullRequestTimelineStop";
import { usePullRequestActivityWidthLayout } from "./hooks/usePullRequestActivityWidthLayout";
import {
	buildPullRequestTimeline,
	type PullRequestActivityEntry,
} from "./utils/buildPullRequestTimeline";

/** Review threads a workspace pane hangs on the rail beside the conversation. */
export interface PullRequestActivityThreads {
	entries: PullRequestActivityEntry[];
	/** Comments inside the entries, replies included, for the heading's count. */
	commentCount: number;
	isLoading: boolean;
	isError: boolean;
}

interface PullRequestActivityProps {
	data: PullRequestDetail;
	/** Where a new comment posts; null hides the composer. */
	commentTarget: PullRequestCommentTarget | null;
	threads?: PullRequestActivityThreads;
}

/**
 * The Activity section: comments, reviews, commits and the pane's review
 * threads on one rail, oldest first, with the composer last. A card's Reply
 * opens its own box under that card. A narrow pane
 * trades the rail and its cards for folded rows. Older hosts and the cloud
 * route send no comments or commits; without threads or a composer there is
 * then nothing to show.
 */
export function PullRequestActivity({
	data,
	commentTarget,
	threads,
}: PullRequestActivityProps) {
	const { t } = useLingui();
	const { ref: sectionRef, layout } = usePullRequestActivityWidthLayout();
	const items = useMemo(
		() =>
			buildPullRequestTimeline({
				comments: data.comments ?? [],
				commits: data.commits ?? [],
				entries: threads?.entries ?? [],
			}),
		[data.comments, data.commits, threads?.entries],
	);
	if (data.comments === undefined && !threads && !commentTarget) return null;
	const known = data.comments !== undefined || threads !== undefined;
	const count =
		items.filter((item) => item.kind === "comment").length +
		(threads?.commentCount ?? 0);
	const commitCount = data.commits?.length ?? 0;
	const loadingEmpty = Boolean(threads?.isLoading) && items.length === 0;
	return (
		<section ref={sectionRef} className="min-w-0" data-pr-comments>
			<div className="flex h-10 items-center gap-2">
				<h2 className="text-sm font-medium">
					<Trans>Activity</Trans>
				</h2>
				{known ? (
					<span className="text-xs text-muted-foreground">
						{t({
							message: plural(count, {
								one: "# comment",
								other: "# comments",
							}),
						})}
						{commitCount > 0
							? ` · ${t({
									message: plural(commitCount, {
										one: "# commit",
										other: "# commits",
									}),
								})}`
							: null}
					</span>
				) : null}
				{threads?.isLoading ? (
					<LoaderCircle
						aria-hidden
						className="size-3 animate-spin text-muted-foreground"
						strokeWidth={1.75}
					/>
				) : null}
				<a
					href={data.url}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={t({ message: "Open on GitHub" })}
					className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
				>
					<ArrowUpRight className="size-4" />
				</a>
			</div>
			{threads?.isError ? (
				<p className="pb-3 text-xs text-destructive">
					<Trans>Unable to load review status</Trans>
				</p>
			) : null}
			<PullRequestActivityLayoutProvider value={layout}>
				<PullRequestActivityReplyProvider value={commentTarget}>
					{items.length > 0 ? (
						<ol
							className={
								layout === "row" ? "flex flex-col gap-1.5" : "flex flex-col"
							}
						>
							{items.map((item, index) => {
								const first = index === 0;
								const last = index === items.length - 1;
								switch (item.kind) {
									case "commits":
										return (
											<PullRequestCommitRun
												key={`commits-${item.commits[0]?.oid}`}
												author={item.author}
												commits={item.commits}
												first={first}
												last={last}
											/>
										);
									case "review-event":
										return (
											<PullRequestReviewEvent
												key={item.comment.id}
												comment={item.comment}
												verdict={item.verdict}
												first={first}
												last={last}
											/>
										);
									case "comment":
										return (
											<PullRequestTimelineStop
												key={item.comment.id}
												card
												rail={layout === "card"}
												first={first}
												last={last}
												node={
													<PullRequestActivityAvatar
														author={item.comment.author}
													/>
												}
											>
												<PullRequestActivityComment
													comment={item.comment}
													prUrl={data.url}
												/>
											</PullRequestTimelineStop>
										);
									case "entry":
										return (
											<PullRequestTimelineStop
												key={item.entry.id}
												card
												rail={layout === "card"}
												first={first}
												last={last}
												node={
													<PullRequestActivityAvatar
														author={item.entry.author}
													/>
												}
											>
												{item.entry.card}
											</PullRequestTimelineStop>
										);
									default:
										return null;
								}
							})}
						</ol>
					) : null}
				</PullRequestActivityReplyProvider>
			</PullRequestActivityLayoutProvider>
			{loadingEmpty ? (
				<div className="space-y-3">
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-9 w-full rounded-md" />
				</div>
			) : null}
			{known && items.length === 0 && !loadingEmpty ? (
				<p className="py-3 text-center text-sm text-muted-foreground">
					<Trans>No comments</Trans>
				</p>
			) : null}
			{commentTarget ? (
				<div className="mt-4">
					<PullRequestConversationComposer target={commentTarget} />
				</div>
			) : null}
		</section>
	);
}

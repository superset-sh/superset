import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuCopy,
	LuLoaderCircle,
	LuUndo2,
} from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PullRequestActivityCard } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActivityCard";
import { PullRequestMarkdown } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestMarkdown";
import { usePullRequestActivityLayout } from "renderer/routes/_authenticated/_dashboard/pull-requests/providers/PullRequestActivityLayoutProvider";
import { usePullRequestActivityReply } from "renderer/routes/_authenticated/_dashboard/pull-requests/providers/PullRequestActivityReplyProvider";
import {
	type PullRequestTarget,
	pullRequestThreadsQueryKey,
	setPullRequestThreadResolution,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/pullRequestClient";
import type { NormalizedComment } from "../../../../../../components/CommentsSection/types";
import type { DiffFocusSide } from "../../../../../../types";
import { PullRequestCommentReply } from "./components/PullRequestCommentReply";
import { PullRequestThreadPath } from "./components/PullRequestThreadPath";

const REPLY_CLASS_NAME =
	"rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";

export interface PullRequestCommentCardProps {
	target: PullRequestTarget;
	comment: NormalizedComment;
	/** Later comments in the same thread. */
	replies?: NormalizedComment[];
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

/** A review thread on the activity rail: file and state in the header, copy and Reply beside them, replies under the body, resolve and open-in-diff in the footer. */
export function PullRequestCommentCard({
	target,
	comment,
	replies = [],
	onOpenInDiff,
}: PullRequestCommentCardProps) {
	const { t } = useLingui();
	const layout = usePullRequestActivityLayout();
	const requestReply = usePullRequestActivityReply();
	const [copied, setCopied] = useState(false);
	const foldable = comment.isResolved || Boolean(comment.isOutdated);
	const [expanded, setExpanded] = useState(false);
	const [wasFoldable, setWasFoldable] = useState(foldable);
	if (foldable !== wasFoldable) {
		setWasFoldable(foldable);
		if (foldable) setExpanded(false);
	}
	const collapsed = foldable && !expanded;
	const queryClient = useQueryClient();
	const utils = workspaceTrpc.useUtils();
	const resolve = useMutation({
		mutationFn: (thread: { threadId: string; resolved: boolean }) =>
			setPullRequestThreadResolution(target, thread),
		// Returned so the button stays pending until the refetched thread shows
		// the new state; the workspace's diff annotations read the same threads.
		onSuccess: () =>
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: pullRequestThreadsQueryKey(target),
				}),
				utils.git.getPullRequestThreads.invalidate(),
			]),
		onError: () => {
			toast.error(t({ message: "Couldn't update thread" }));
		},
	});
	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(timer);
	}, [copied]);
	const canOpenCode = Boolean(comment.path && onOpenInDiff);
	// A folded row or a collapsed card is itself a button, so the path cannot
	// be one inside it; the footer's "Open in diff" still opens the file there.
	const pathOpensDiff = canOpenCode && layout === "card" && !collapsed;
	const openCode = () => {
		if (comment.path)
			onOpenInDiff?.(
				comment.path,
				comment.line,
				undefined,
				comment.diffSide === "LEFT"
					? "deletions"
					: comment.diffSide === "RIGHT"
						? "additions"
						: undefined,
			);
	};
	const copy = async () => {
		try {
			await electronTrpcClient.external.copyText.mutate(comment.body);
			setCopied(true);
		} catch {
			toast.error(t({ message: "Couldn't copy comment" }));
		}
	};
	const replyId = comment.databaseId;
	const reply =
		requestReply && replyId != null
			? () =>
					requestReply({
						commentId: replyId,
						author: {
							login: comment.authorLogin,
							avatarUrl: comment.avatarUrl,
						},
					})
			: null;
	return (
		<PullRequestActivityCard
			author={{ login: comment.authorLogin, avatarUrl: comment.avatarUrl }}
			meta={
				<>
					{comment.path ? (
						<PullRequestThreadPath
							path={comment.path}
							line={comment.line}
							onOpen={pathOpensDiff ? openCode : undefined}
						/>
					) : null}
					{comment.isResolved ? (
						<span className="shrink-0 text-emerald-600 [.dark_&]:text-emerald-400">
							<Trans>Resolved</Trans>
						</span>
					) : comment.isOutdated ? (
						<span className="shrink-0">
							<Trans>Outdated</Trans>
						</span>
					) : null}
				</>
			}
			createdAt={comment.createdAt}
			url={comment.url}
			collapsed={collapsed}
			onCollapsedChange={foldable ? (value) => setExpanded(!value) : undefined}
			actions={
				<>
					<Button
						size="icon"
						variant="ghost"
						className="size-6 text-muted-foreground"
						onClick={() => void copy()}
						aria-label={
							copied ? t({ message: "Copied" }) : t({ message: "Copy comment" })
						}
					>
						{copied ? (
							<LuCheck className="size-3.5" />
						) : (
							<LuCopy className="size-3.5" />
						)}
					</Button>
					{reply ? (
						<button type="button" onClick={reply} className={REPLY_CLASS_NAME}>
							<Trans>Reply</Trans>
						</button>
					) : comment.url ? (
						<a
							href={comment.url}
							target="_blank"
							rel="noopener noreferrer"
							className={REPLY_CLASS_NAME}
						>
							<Trans>Reply</Trans>
						</a>
					) : null}
				</>
			}
			replies={
				replies.length > 0
					? replies.map((item) => (
							<PullRequestCommentReply key={item.id} comment={item} />
						))
					: null
			}
			footer={
				comment.threadId || canOpenCode ? (
					<>
						{comment.threadId ? (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
								disabled={resolve.isPending}
								onClick={() => {
									if (comment.threadId)
										resolve.mutate({
											threadId: comment.threadId,
											resolved: !comment.isResolved,
										});
								}}
							>
								{resolve.isPending ? (
									<LuLoaderCircle
										aria-hidden
										className="size-3.5 animate-spin"
									/>
								) : comment.isResolved ? (
									<LuUndo2 className="size-3.5" />
								) : (
									<LuCheck className="size-3.5" />
								)}
								{comment.isResolved ? (
									<Trans>Unresolve</Trans>
								) : (
									<Trans>Resolve conversation</Trans>
								)}
							</Button>
						) : (
							<span />
						)}
						{canOpenCode ? (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1.5 px-2 text-xs"
								onClick={openCode}
							>
								<Trans>Open in diff</Trans>
								<LuArrowUpRight className="size-3.5" />
							</Button>
						) : null}
					</>
				) : null
			}
		>
			<PullRequestMarkdown body={comment.body} size="comment" />
		</PullRequestActivityCard>
	);
}

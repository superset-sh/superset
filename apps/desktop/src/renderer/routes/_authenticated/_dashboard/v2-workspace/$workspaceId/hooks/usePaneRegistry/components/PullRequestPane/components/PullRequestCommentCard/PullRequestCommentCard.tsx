import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useRef, useState } from "react";
import {
	LuArrowUpRight,
	LuCheck,
	LuCopy,
	LuLoaderCircle,
	LuUndo2,
} from "react-icons/lu";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PullRequestActivityCard } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestActivityCard";
import {
	PullRequestConversationComposer,
	type PullRequestConversationComposerHandle,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestConversationComposer";
import { PullRequestMarkdown } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestMarkdown";
import { PullRequestReplyAction } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestReplyAction";
import { usePullRequestActivityLayout } from "renderer/routes/_authenticated/_dashboard/pull-requests/providers/PullRequestActivityLayoutProvider";
import { usePullRequestActivityReply } from "renderer/routes/_authenticated/_dashboard/pull-requests/providers/PullRequestActivityReplyProvider";
import type { NormalizedComment } from "../../../../../../components/CommentsSection/types";
import type { DiffFocusSide } from "../../../../../../types";
import { PullRequestCommentReply } from "./components/PullRequestCommentReply";
import { PullRequestThreadPath } from "./components/PullRequestThreadPath";

export interface PullRequestCommentCardProps {
	workspaceId: string;
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

/** A review thread on the activity rail: file and state in the header, copy and Reply beside them, replies under the body, resolve and open-in-diff in the footer. Reply opens a box under the card that posts into the thread. */
export function PullRequestCommentCard({
	workspaceId,
	comment,
	replies = [],
	onOpenInDiff,
}: PullRequestCommentCardProps) {
	const { t } = useLingui();
	const layout = usePullRequestActivityLayout();
	const replyTarget = usePullRequestActivityReply();
	const replyBoxRef = useRef<PullRequestConversationComposerHandle>(null);
	const [replying, setReplying] = useState(false);
	const [copied, setCopied] = useState(false);
	const foldable = comment.isResolved || Boolean(comment.isOutdated);
	const [expanded, setExpanded] = useState(false);
	const [wasFoldable, setWasFoldable] = useState(foldable);
	if (foldable !== wasFoldable) {
		setWasFoldable(foldable);
		if (foldable) setExpanded(false);
	}
	const collapsed = foldable && !expanded;
	const utils = workspaceTrpc.useUtils();
	const resolve = workspaceTrpc.git.setReviewThreadResolution.useMutation({
		// Returned so the button stays pending until the refetched thread shows the new state.
		onSuccess: () =>
			utils.git.getPullRequestThreads.invalidate({ workspaceId }),
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
	const canReply = replyTarget !== null && replyId != null;
	const reply = () => {
		if (replying) replyBoxRef.current?.focus();
		else setReplying(true);
	};
	return (
		<>
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
				onCollapsedChange={
					foldable ? (value) => setExpanded(!value) : undefined
				}
				actions={
					<>
						<Button
							size="icon"
							variant="ghost"
							className="size-6 text-muted-foreground"
							onClick={() => void copy()}
							aria-label={
								copied
									? t({ message: "Copied" })
									: t({ message: "Copy comment" })
							}
						>
							{copied ? (
								<LuCheck className="size-3.5" />
							) : (
								<LuCopy className="size-3.5" />
							)}
						</Button>
						<PullRequestReplyAction
							onReply={canReply ? reply : null}
							href={comment.url}
						/>
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
												workspaceId,
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
			{replying && replyTarget && replyId != null ? (
				<div className="mt-2">
					<PullRequestConversationComposer
						ref={replyBoxRef}
						target={replyTarget}
						threadCommentId={replyId}
						onClose={() => setReplying(false)}
					/>
				</div>
			) : null}
		</>
	);
}

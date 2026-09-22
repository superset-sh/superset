import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { CheckCheck, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuCheck, LuCopy } from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { CommentPaneData, DiffFocusSide } from "../../types";
import { CommentRow } from "./components/CommentRow";
import type { NormalizedComment } from "./types";

interface CommentsSectionProps {
	workspaceId: string;
	comments: NormalizedComment[];
	isLoading: boolean;
	onOpenComment?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

export function CommentsSection({
	workspaceId,
	comments,
	isLoading,
	onOpenComment,
	onOpenInDiff,
}: CommentsSectionProps) {
	const { t } = useLingui();
	const [commentsOpen, setCommentsOpen] = useState(true);
	const [reviewOpen, setReviewOpen] = useState(true);
	const [resolvedOpen, setResolvedOpen] = useState(false);
	const [copiedActionKey, setCopiedActionKey] = useState<string | null>(null);
	const [isResolvingAll, setIsResolvingAll] = useState(false);
	const copiedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);
	const utils = workspaceTrpc.useUtils();
	const setReviewThreadResolution =
		workspaceTrpc.git.setReviewThreadResolution.useMutation();

	const copyToClipboard = useCallback(
		(text: string) => electronTrpcClient.external.copyText.mutate(text),
		[],
	);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
		};
	}, []);

	const conversationComments = useMemo(
		() => comments.filter((c) => c.kind === "conversation"),
		[comments],
	);
	const openReviewComments = useMemo(
		() => comments.filter((c) => c.kind === "review" && !c.isResolved),
		[comments],
	);
	const resolvableThreadIds = useMemo(
		() => [
			...new Set(
				openReviewComments
					.map((comment) => comment.threadId)
					.filter((threadId): threadId is string => Boolean(threadId)),
			),
		],
		[openReviewComments],
	);
	const resolvedComments = useMemo(
		() => comments.filter((c) => c.kind === "review" && c.isResolved),
		[comments],
	);

	const markCopied = useCallback((key: string) => {
		if (!isMountedRef.current) return;
		if (copiedResetRef.current) clearTimeout(copiedResetRef.current);
		setCopiedActionKey(key);
		copiedResetRef.current = setTimeout(() => {
			if (!isMountedRef.current) return;
			setCopiedActionKey(null);
			copiedResetRef.current = null;
		}, 1500);
	}, []);

	const handleCopySingle = useCallback(
		(comment: NormalizedComment) => {
			void copyToClipboard(
				comment.body.trim() ||
					t({
						message: "No comment body",
					}),
			)
				.then(() => {
					markCopied(`comment:${comment.id}`);
				})
				.catch((err) => {
					console.warn("Failed to copy comment", err);
				});
		},
		[copyToClipboard, markCopied, t],
	);

	const copyCommentList = useCallback(
		(list: NormalizedComment[], actionKey: string) => {
			const text = buildCommentsClipboardText(list);
			void copyToClipboard(text)
				.then(() => {
					markCopied(actionKey);
				})
				.catch((err) => {
					console.warn("Failed to copy comments", err);
				});
		},
		[copyToClipboard, markCopied],
	);

	const handleCopyConversationComments = useCallback(() => {
		copyCommentList(conversationComments, "comments:conversation");
	}, [copyCommentList, conversationComments]);

	const handleCopyReviewComments = useCallback(() => {
		copyCommentList(openReviewComments, "comments:review");
	}, [copyCommentList, openReviewComments]);

	const handleResolveAll = useCallback(async () => {
		if (resolvableThreadIds.length === 0) return;

		setIsResolvingAll(true);
		try {
			const results = await Promise.allSettled(
				resolvableThreadIds.map((threadId) =>
					setReviewThreadResolution.mutateAsync({
						workspaceId,
						threadId,
						resolved: true,
					}),
				),
			);

			if (results.some((result) => result.status === "fulfilled")) {
				await utils.git.getPullRequestThreads.invalidate({ workspaceId });
			}

			const failedCount = results.filter(
				(result) => result.status === "rejected",
			).length;
			if (failedCount > 0) {
				toast.error(
					failedCount === 1
						? t({
								message: `Failed to resolve ${failedCount} thread`,
							})
						: t({
								message: `Failed to resolve ${failedCount} threads`,
							}),
				);
			}
		} finally {
			if (isMountedRef.current) setIsResolvingAll(false);
		}
	}, [
		resolvableThreadIds,
		setReviewThreadResolution,
		utils.git.getPullRequestThreads,
		workspaceId,
		t,
	]);

	const conversationCommentsCountLabel = isLoading
		? "..."
		: conversationComments.length;
	const reviewCommentsCountLabel = isLoading
		? "..."
		: openReviewComments.length;
	const conversationCopyAllLabel =
		copiedActionKey === "comments:conversation"
			? t({ message: "Copied" })
			: t({ message: "Copy all" });
	const reviewCopyAllLabel =
		copiedActionKey === "comments:review"
			? t({ message: "Copied" })
			: t({ message: "Copy all" });

	return (
		<>
			<Collapsible
				open={commentsOpen}
				onOpenChange={setCommentsOpen}
				className="min-w-0"
			>
				<div className="flex min-w-0 items-center">
					<CollapsibleTrigger
						className={cn(
							"flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left",
							"cursor-pointer transition-colors hover:bg-accent/30",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
								commentsOpen && "rotate-90",
							)}
						/>
						<span className="truncate text-xs font-medium">
							<Trans>Comments</Trans>
						</span>
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{conversationCommentsCountLabel}
						</span>
					</CollapsibleTrigger>
					{conversationComments.length > 0 && (
						<div className="mr-1.5 flex items-center gap-1">
							<button
								type="button"
								className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
								onClick={handleCopyConversationComments}
							>
								{copiedActionKey === "comments:conversation" ? (
									<LuCheck className="size-3" />
								) : (
									<LuCopy className="size-3" />
								)}
								<span>{conversationCopyAllLabel}</span>
							</button>
						</div>
					)}
				</div>
				<CollapsibleContent className="min-w-0 overflow-hidden px-0.5 pb-1">
					{isLoading ? (
						renderCommentSkeletons()
					) : conversationComments.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-muted-foreground">
							<Trans>No comments yet.</Trans>
						</div>
					) : (
						conversationComments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								copiedActionKey={copiedActionKey}
								onCopy={handleCopySingle}
								onOpen={onOpenComment}
								onOpenInDiff={onOpenInDiff}
							/>
						))
					)}
				</CollapsibleContent>
			</Collapsible>

			<Collapsible
				open={reviewOpen}
				onOpenChange={setReviewOpen}
				className="min-w-0"
			>
				<div className="flex min-w-0 items-center">
					<CollapsibleTrigger
						className={cn(
							"flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left",
							"cursor-pointer transition-colors hover:bg-accent/30",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
								reviewOpen && "rotate-90",
							)}
						/>
						<span className="truncate text-xs font-medium">
							<Trans>Review</Trans>
						</span>
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{reviewCommentsCountLabel}
						</span>
					</CollapsibleTrigger>
					{openReviewComments.length > 0 && (
						<div className="mr-1.5 flex items-center gap-1">
							{resolvableThreadIds.length > 0 && (
								<button
									type="button"
									className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground disabled:opacity-50"
									onClick={() => void handleResolveAll()}
									disabled={isResolvingAll}
								>
									{isResolvingAll ? (
										<LoaderCircle className="size-3 animate-spin" />
									) : (
										<CheckCheck className="size-3" />
									)}
									<span>
										<Trans>Resolve all</Trans>
									</span>
								</button>
							)}
							<button
								type="button"
								className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
								onClick={handleCopyReviewComments}
							>
								{copiedActionKey === "comments:review" ? (
									<LuCheck className="size-3" />
								) : (
									<LuCopy className="size-3" />
								)}
								<span>{reviewCopyAllLabel}</span>
							</button>
						</div>
					)}
				</div>
				<CollapsibleContent className="min-w-0 overflow-hidden px-0.5 pb-1">
					{isLoading ? (
						renderCommentSkeletons()
					) : openReviewComments.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-muted-foreground">
							<Trans>No open review comments.</Trans>
						</div>
					) : (
						openReviewComments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								copiedActionKey={copiedActionKey}
								onCopy={handleCopySingle}
								onOpen={onOpenComment}
								onOpenInDiff={onOpenInDiff}
							/>
						))
					)}
				</CollapsibleContent>
			</Collapsible>

			{resolvedComments.length > 0 && (
				<Collapsible
					open={resolvedOpen}
					onOpenChange={setResolvedOpen}
					className="min-w-0"
				>
					<CollapsibleTrigger
						className={cn(
							"flex w-full min-w-0 items-center gap-1.5 px-2 py-1.5 text-left",
							"cursor-pointer transition-colors hover:bg-accent/30",
						)}
					>
						<VscChevronRight
							className={cn(
								"size-3 shrink-0 text-muted-foreground transition-transform duration-150",
								resolvedOpen && "rotate-90",
							)}
						/>
						<span className="truncate text-xs font-medium">
							<Trans>Resolved</Trans>
						</span>
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{resolvedComments.length}
						</span>
					</CollapsibleTrigger>
					<CollapsibleContent className="min-w-0 overflow-hidden px-0.5 pb-1">
						{resolvedComments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								copiedActionKey={copiedActionKey}
								onCopy={handleCopySingle}
								onOpen={onOpenComment}
								onOpenInDiff={onOpenInDiff}
							/>
						))}
					</CollapsibleContent>
				</Collapsible>
			)}
		</>
	);
}

function buildCommentsClipboardText(comments: NormalizedComment[]): string {
	return comments
		.map((c) => {
			const location = c.path
				? c.line
					? `${c.path}:${c.line}`
					: c.path
				: c.kind === "conversation"
					? i18n._(
							msg({
								message: "Conversation",
							}),
						)
					: null;
			const meta = [
				c.authorLogin,
				c.kind === "review"
					? i18n._(
							msg({
								message: "Review",
							}),
						)
					: i18n._(
							msg({
								message: "Comment",
							}),
						),
				location,
			]
				.filter(Boolean)
				.join(" \u2022 ");
			return [
				meta,
				c.body.trim() ||
					i18n._(
						msg({
							message: "No comment body",
						}),
					),
			]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n\n---\n\n");
}

function renderCommentSkeletons() {
	return (
		<div className="space-y-1 px-1">
			<Skeleton className="h-11 w-full rounded-sm" />
			<Skeleton className="h-11 w-full rounded-sm" />
			<Skeleton className="h-11 w-full rounded-sm" />
		</div>
	);
}

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	CheckCheck,
	ChevronDown,
	Copy as CopyIcon,
	ExternalLink,
	GitCompare,
	LoaderCircle,
	MessageSquare,
	SquarePlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { getMarkdownPreviewText } from "renderer/utils/markdownPreview";
import type { CommentPaneData, DiffFocusSide } from "../../../../../../types";
import type { NormalizedComment } from "../../types";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortAge(isoDate?: string): string | null {
	if (!isoDate) return null;
	const ms = Date.now() - new Date(isoDate).getTime();
	if (Number.isNaN(ms) || ms < 0) return null;
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${Math.max(1, seconds)}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// CommentRow
// ---------------------------------------------------------------------------

interface CommentRowProps {
	comment: NormalizedComment;
	copiedActionKey: string | null;
	onCopy: (comment: NormalizedComment) => void;
	onOpen?: (comment: CommentPaneData) => void;
	onOpenInDiff?: (
		path: string,
		line?: number,
		openInNewTab?: boolean,
		side?: DiffFocusSide,
	) => void;
}

function CommentRow({
	comment,
	copiedActionKey,
	onCopy,
	onOpen,
	onOpenInDiff,
}: CommentRowProps) {
	const { t } = useLingui();
	const age = formatShortAge(comment.createdAt);
	const isCopied = copiedActionKey === `comment:${comment.id}`;

	const handleClick = () => {
		// Default click jumps to the comment in the diff. Fall back to the
		// standalone comment pane when there's no file anchor (conversation
		// comments) or no diff handler wired up.
		if (comment.kind === "review" && comment.path && onOpenInDiff) {
			onOpenInDiff(
				comment.path,
				comment.line,
				undefined,
				toDiffFocusSide(comment.diffSide),
			);
			return;
		}
		onOpen?.({
			commentId: comment.id,
			authorLogin: comment.authorLogin,
			avatarUrl: comment.avatarUrl,
			body: comment.body,
			url: comment.url,
			path: comment.path,
			line: comment.line,
		});
	};

	const content = (
		<>
			<Avatar className="mt-0.5 size-4 shrink-0">
				{comment.avatarUrl ? (
					<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
				) : null}
				<AvatarFallback className="text-[10px] font-medium">
					{comment.authorLogin.slice(0, 2).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<span className="truncate text-xs font-medium text-foreground">
						{comment.authorLogin}
					</span>
					{comment.kind === "review" && comment.isOutdated ? (
						<span className="shrink-0 rounded border border-border/70 bg-muted/35 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
							<Trans>Outdated</Trans>
						</span>
					) : null}
					<span className="flex-1" />
					{age ? (
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{age}
						</span>
					) : null}
				</div>
				<p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
					{getMarkdownPreviewText(comment.body)}
				</p>
			</div>
		</>
	);

	return (
		<div className="group relative flex items-start gap-1 rounded-sm px-1.5 py-1 transition-colors hover:bg-accent/50">
			<button
				type="button"
				onClick={handleClick}
				className="flex min-w-0 flex-1 items-start gap-2 text-left"
				aria-label={t({
					message: `View comment by ${comment.authorLogin}`,
				})}
			>
				{content}
			</button>
			<div className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-sm bg-background/90 px-0.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
				{comment.url ? (
					<a
						href={comment.url}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label={t({
							message: "Open comment on GitHub",
						})}
					>
						<LuArrowUpRight className="size-3" />
					</a>
				) : null}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							onClick={(e) => e.stopPropagation()}
							aria-label={t({
								message: "More actions",
							})}
							className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
						>
							<ChevronDown className="size-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						{comment.kind === "review" && comment.path && onOpenInDiff ? (
							<>
								<DropdownMenuItem
									onSelect={() =>
										onOpenInDiff(
											comment.path as string,
											comment.line,
											undefined,
											toDiffFocusSide(comment.diffSide),
										)
									}
								>
									<GitCompare />
									<Trans>Open in diff</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={() =>
										onOpenInDiff(
											comment.path as string,
											comment.line,
											true,
											toDiffFocusSide(comment.diffSide),
										)
									}
								>
									<SquarePlus />
									<Trans>Open in diff in new tab</Trans>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						) : null}
						{onOpen ? (
							<DropdownMenuItem
								onSelect={() =>
									onOpen({
										commentId: comment.id,
										authorLogin: comment.authorLogin,
										avatarUrl: comment.avatarUrl,
										body: comment.body,
										url: comment.url,
										path: comment.path,
										line: comment.line,
									})
								}
							>
								<MessageSquare />
								<Trans>Open as comment pane</Trans>
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem onSelect={() => onCopy(comment)}>
							{isCopied ? <LuCheck /> : <CopyIcon />}
							{isCopied
								? t({
										message: "Copied",
									})
								: t({
										message: "Copy comment",
									})}
						</DropdownMenuItem>
						{comment.url ? (
							<DropdownMenuItem
								onSelect={() => window.open(comment.url, "_blank", "noopener")}
							>
								<ExternalLink />
								<Trans>Open on GitHub</Trans>
							</DropdownMenuItem>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function toDiffFocusSide(
	side: NormalizedComment["diffSide"],
): DiffFocusSide | undefined {
	if (side === "LEFT") return "deletions";
	if (side === "RIGHT") return "additions";
	return undefined;
}

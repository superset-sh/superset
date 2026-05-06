import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Skeleton } from "@superset/ui/skeleton";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import { VscChevronRight } from "react-icons/vsc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { CommentPaneData } from "../../../../../../types";
import type { NormalizedComment } from "../../types";

interface CommentsSectionProps {
	comments: NormalizedComment[];
	isLoading: boolean;
	onOpenComment?: (comment: CommentPaneData) => void;
}

export function CommentsSection({
	comments,
	isLoading,
	onOpenComment,
}: CommentsSectionProps) {
	const [commentsOpen, setCommentsOpen] = useState(true);
	const [resolvedOpen, setResolvedOpen] = useState(false);
	const [copiedActionKey, setCopiedActionKey] = useState<string | null>(null);
	const copiedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

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

	const activeComments = useMemo(
		() => comments.filter((c) => !c.isResolved),
		[comments],
	);
	const resolvedComments = useMemo(
		() => comments.filter((c) => c.isResolved),
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
			void copyToClipboard(comment.body.trim() || "No comment body")
				.then(() => {
					markCopied(`comment:${comment.id}`);
				})
				.catch((err) => {
					console.warn("Failed to copy comment", err);
				});
		},
		[copyToClipboard, markCopied],
	);

	const handleCopyAll = useCallback(() => {
		const text = activeComments
			.map((c) => {
				const location = c.path
					? c.line
						? `${c.path}:${c.line}`
						: c.path
					: c.kind === "conversation"
						? "Conversation"
						: null;
				const meta = [
					c.authorLogin,
					c.kind === "review" ? "Review" : "Comment",
					location,
				]
					.filter(Boolean)
					.join(" \u2022 ");
				return [meta, c.body.trim() || "No comment body"]
					.filter(Boolean)
					.join("\n");
			})
			.join("\n\n---\n\n");
		void copyToClipboard(text)
			.then(() => {
				markCopied("comments:all");
			})
			.catch((err) => {
				console.warn("Failed to copy comments", err);
			});
	}, [copyToClipboard, activeComments, markCopied]);

	const commentsCountLabel = isLoading ? "..." : comments.length;
	const copyAllLabel =
		copiedActionKey === "comments:all" ? "Copied" : "Copy all";

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
						<span className="truncate text-xs font-medium">Comments</span>
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{commentsCountLabel}
						</span>
					</CollapsibleTrigger>
					{activeComments.length > 0 && (
						<div className="mr-1.5 flex items-center gap-1">
							<button
								type="button"
								className="flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
								onClick={handleCopyAll}
							>
								{copiedActionKey === "comments:all" ? (
									<LuCheck className="size-3" />
								) : (
									<LuCopy className="size-3" />
								)}
								<span>{copyAllLabel}</span>
							</button>
						</div>
					)}
				</div>
				<CollapsibleContent className="min-w-0 overflow-hidden px-0.5 pb-1">
					{isLoading ? (
						<div className="space-y-1 px-1">
							<Skeleton className="h-11 w-full rounded-sm" />
							<Skeleton className="h-11 w-full rounded-sm" />
							<Skeleton className="h-11 w-full rounded-sm" />
						</div>
					) : comments.length === 0 ? (
						<div className="px-1.5 py-1 text-xs text-muted-foreground">
							No comments yet.
						</div>
					) : (
						activeComments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								copiedActionKey={copiedActionKey}
								onCopy={handleCopySingle}
								onOpen={onOpenComment}
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
						<span className="truncate text-xs font-medium">Resolved</span>
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
							/>
						))}
					</CollapsibleContent>
				</Collapsible>
			)}
		</>
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

function getPreviewText(body: string): string {
	return (
		body
			.replace(/<!--[\s\S]*?-->/g, "\n")
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean)
			?.replace(/^[-*+>]\s*/, "")
			?.replace(/\s+/g, " ") ?? "No preview available"
	);
}

// ---------------------------------------------------------------------------
// CommentRow
// ---------------------------------------------------------------------------

interface CommentRowProps {
	comment: NormalizedComment;
	copiedActionKey: string | null;
	onCopy: (comment: NormalizedComment) => void;
	onOpen?: (comment: CommentPaneData) => void;
}

function CommentRow({
	comment,
	copiedActionKey,
	onCopy,
	onOpen,
}: CommentRowProps) {
	const age = formatShortAge(comment.createdAt);
	const isCopied = copiedActionKey === `comment:${comment.id}`;

	const handleClick = () => {
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
					<span className="shrink-0 rounded border border-border/70 bg-muted/35 px-1 py-0 text-[9px] uppercase tracking-wide text-muted-foreground">
						{comment.kind === "review" ? "Review" : "Comment"}
					</span>
					<span className="flex-1" />
					{age ? (
						<span className="shrink-0 text-[10px] text-muted-foreground">
							{age}
						</span>
					) : null}
				</div>
				<p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted-foreground">
					{getPreviewText(comment.body)}
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
				aria-label={`View comment by ${comment.authorLogin}`}
			>
				{content}
			</button>
			<div className="absolute right-0.5 top-0.5 flex items-center gap-0.5 rounded-sm bg-background/90 px-0.5 py-0.5 shadow-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
				<button
					type="button"
					className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onCopy(comment);
					}}
					aria-label={isCopied ? "Copied comment" : "Copy comment"}
				>
					{isCopied ? (
						<LuCheck className="size-3" />
					) : (
						<LuCopy className="size-3" />
					)}
				</button>
				{comment.url ? (
					<a
						href={comment.url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						aria-label="Open comment on GitHub"
					>
						<LuArrowUpRight className="size-3" />
					</a>
				) : null}
			</div>
		</div>
	);
}

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	LuCheck,
	LuChevronRight,
	LuCopy,
	LuExternalLink,
	LuLoaderCircle,
} from "react-icons/lu";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import { ReviewThreadReplyComposer } from "renderer/routes/_authenticated/_dashboard/components/ReviewThreadReplyComposer";
import "./comment-thread.css";

interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface PullRequestCommentThreadProps {
	isResolved: boolean;
	isOutdated?: boolean;
	url?: string;
	comments: Comment[];
	onResolveChange: (resolved: boolean) => void;
	isResolvePending?: boolean;
	/** Returns false when the reply couldn't be dispatched (e.g. the thread
	 *  has no comment to reply onto yet) so the caller knows not to clear
	 *  the draft. */
	onReply: (body: string) => boolean;
	isReplyPending?: boolean;
	/** Force-expand the bubble whenever this changes — lets "jump to
	 *  comment" reveal a collapsed (resolved/outdated) thread. */
	focusTick?: number;
}

// A decoupled twin of the v2-workspace DiffPane's CommentThread: same
// visuals, but the resolve mutation is injected via a prop instead of
// wired to that component's workspaceId-scoped git.setReviewThreadResolution
// call, since this one's callers (the PR list/detail Code tab) browse a PR
// directly and don't necessarily have a workspace linked to it. The reply
// box is the shared ReviewThreadReplyComposer; only the dispatch differs.
export function PullRequestCommentThread({
	isResolved,
	isOutdated,
	url,
	comments,
	onResolveChange,
	isResolvePending,
	onReply,
	isReplyPending,
	focusTick,
}: PullRequestCommentThreadProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(!isResolved && !isOutdated);
	const [isCopied, setIsCopied] = useState(false);
	const [replyText, setReplyText] = useState("");
	useEffect(() => {
		if (!isCopied) return;
		const timer = setTimeout(() => setIsCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [isCopied]);
	const handleCopy = (e: React.MouseEvent) => {
		e.stopPropagation();
		const text =
			comments.length === 1
				? comments[0].body
				: comments.map((c) => `@${c.authorLogin}:\n${c.body}`).join("\n\n");
		navigator.clipboard
			.writeText(text)
			.then(() => setIsCopied(true))
			.catch((err) => {
				console.error("[PullRequestCommentThread/copy] Failed to copy:", err);
				toast.error(
					t({
						message: "Couldn't copy comment",
					}),
				);
			});
	};
	// Auto-collapse on resolve/outdated (matches GitHub).
	useEffect(() => {
		if (isResolved || isOutdated) setOpen(false);
	}, [isResolved, isOutdated]);
	// Force-expand when the reviewer jumps to this thread, even if it was
	// collapsed for being resolved or outdated.
	useEffect(() => {
		if (focusTick != null) setOpen(true);
	}, [focusTick]);

	const firstComment = comments[0];

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				// Full-bleed band flush with the diff pane's edges (no side
				// margin/rounding/border-box) so it reads as part of the diff
				// like GitHub's inline review threads, not a floating card.
				// font-sans: the annotation slot is mounted inside the same
				// <pre> the code lines live in, which sets a monospace
				// --diffs-font-family that would otherwise leak into this
				// prose (author names, timestamps, comment bodies).
				"pr-diff-comment w-full border-y border-border/50 bg-muted/20 font-sans text-card-foreground",
				isResolved && "opacity-75",
			)}
		>
			<div className="flex items-center gap-2 px-3 py-1.5">
				<CollapsibleTrigger
					className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none"
					aria-label={
						open
							? t({
									message: "Collapse thread",
								})
							: t({
									message: "Expand thread",
								})
					}
				>
					<LuChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							open && "rotate-90",
						)}
					/>
					{firstComment && (
						<Avatar className="size-4 shrink-0">
							{firstComment.avatarUrl ? (
								<AvatarImage
									src={firstComment.avatarUrl}
									alt={firstComment.authorLogin}
								/>
							) : null}
							<AvatarFallback className="text-[8px]">
								{firstComment.authorLogin.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					)}
					<span className="shrink-0 font-medium text-foreground/90">
						<Plural
							value={comments.length}
							one="# comment"
							other="# comments"
						/>
					</span>
				</CollapsibleTrigger>
				<div className="flex shrink-0 items-center gap-1.5">
					{isOutdated && (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
							<Trans>Outdated</Trans>
						</span>
					)}
					{isResolved && (
						<span className="rounded-full bg-[#dcfae8] px-1.5 py-0.5 text-[10px] font-medium text-[#00a558] [.dark_&]:bg-[#064e3b] [.dark_&]:text-[#34d399]">
							<Trans>Resolved</Trans>
						</span>
					)}
					<button
						type="button"
						onClick={handleCopy}
						className="shrink-0 text-muted-foreground hover:text-foreground"
						aria-label={
							isCopied
								? t({
										message: "Copied",
									})
								: comments.length === 1
									? t({
											message: "Copy comment",
										})
									: t({
											message: "Copy comments",
										})
						}
					>
						{isCopied ? (
							<LuCheck className="size-3 text-green-500" />
						) : (
							<LuCopy className="size-3" />
						)}
					</button>
					{url && (
						<a
							href={url}
							target="_blank"
							rel="noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="shrink-0 text-muted-foreground hover:text-foreground"
							aria-label={t({
								message: "Open on GitHub",
							})}
						>
							<LuExternalLink className="size-3" />
						</a>
					)}
				</div>
			</div>
			<CollapsibleContent className="overflow-hidden border-t border-border/50 data-[state=closed]:animate-none">
				<ul className="divide-y divide-border/50">
					{comments.map((comment) => (
						<CommentRow key={comment.id} comment={comment} />
					))}
				</ul>
				<ReviewThreadReplyComposer
					value={replyText}
					onChange={setReplyText}
					onReply={onReply}
					isPending={isReplyPending}
					className="border-border/50 bg-muted/20 px-3"
					actions={
						<Button
							type="button"
							size="xs"
							variant="outline"
							disabled={isResolvePending}
							onClick={() => onResolveChange(!isResolved)}
						>
							{isResolvePending && (
								<LuLoaderCircle className="size-3 animate-spin" />
							)}
							{isResolved ? (
								<Trans>Unresolve</Trans>
							) : (
								<Trans>Resolve conversation</Trans>
							)}
						</Button>
					}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

function CommentRow({ comment }: { comment: Comment }) {
	return (
		<li className="flex gap-2 px-3 py-2.5">
			<Avatar className="mt-0.5 size-5 shrink-0">
				{comment.avatarUrl ? (
					<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
				) : null}
				<AvatarFallback className="text-[10px]">
					{comment.authorLogin.slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2 text-xs">
					<span className="font-medium text-foreground">
						{comment.authorLogin}
					</span>
					{comment.createdAt != null && (
						<time
							className="text-muted-foreground"
							dateTime={new Date(comment.createdAt).toISOString()}
						>
							{formatRelative(comment.createdAt)}
						</time>
					)}
				</div>
				<div className="pr-diff-comment-body mt-1">
					<CommentMarkdown body={comment.body} />
				</div>
			</div>
		</li>
	);
}

function formatRelative(ms: number): string {
	// Floor (not round) so a 30-minute comment doesn't read "1h ago".
	// Clamp >=0 so future-dated timestamps from clock skew aren't negative.
	const delta = Math.max(0, Date.now() - ms);
	const seconds = Math.floor(delta / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.floor(days / 365);
	return `${years}y ago`;
}

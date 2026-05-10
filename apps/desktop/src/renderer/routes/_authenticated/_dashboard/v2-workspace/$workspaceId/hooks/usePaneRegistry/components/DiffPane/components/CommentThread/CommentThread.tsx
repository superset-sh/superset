import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useEffect, useState } from "react";
import { LuChevronRight, LuExternalLink, LuLoaderCircle } from "react-icons/lu";
import { CommentMarkdown } from "renderer/components/CommentMarkdown";
import "./comment-thread.css";

interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface CommentThreadProps {
	workspaceId: string;
	threadId: string;
	isResolved: boolean;
	isOutdated?: boolean;
	url?: string;
	comments: Comment[];
	/** Force-expand the bubble whenever this changes — lets jump-to-line
	 *  reveal a collapsed (resolved/outdated) thread. */
	focusTick?: number;
}

export function CommentThread({
	workspaceId,
	threadId,
	isResolved,
	isOutdated,
	url,
	comments,
	focusTick,
}: CommentThreadProps) {
	const [open, setOpen] = useState(!isResolved && !isOutdated);
	// Auto-collapse on resolve/outdated (matches GitHub).
	useEffect(() => {
		if (isResolved || isOutdated) setOpen(false);
	}, [isResolved, isOutdated]);
	// Force-expand when the reviewer jumps to this line, even if it was
	// collapsed for being resolved or outdated.
	useEffect(() => {
		if (focusTick != null) setOpen(true);
	}, [focusTick]);
	const utils = workspaceTrpc.useUtils();
	const setResolution = workspaceTrpc.git.setReviewThreadResolution.useMutation(
		{
			onSuccess: () => {
				void utils.git.getPullRequestThreads.invalidate({ workspaceId });
			},
			onError: (error) => {
				toast.error("Couldn't update thread", {
					description: error.message,
				});
			},
		},
	);

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"diff-comment my-1 overflow-hidden rounded-md border border-border bg-card text-card-foreground",
				isResolved && "opacity-70",
			)}
		>
			<div className="flex items-center gap-2 px-2.5 py-1.5">
				<CollapsibleTrigger
					className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none"
					aria-label={open ? "Collapse thread" : "Expand thread"}
				>
					<LuChevronRight
						className={cn(
							"size-3 shrink-0 transition-transform",
							open && "rotate-90",
						)}
					/>
					<span className="shrink-0">
						{comments.length === 1
							? "1 comment"
							: `${comments.length} comments`}
					</span>
					{isOutdated && (
						<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
							Outdated
						</span>
					)}
					{isResolved && (
						<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide">
							Resolved
						</span>
					)}
				</CollapsibleTrigger>
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Open on GitHub"
					>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</div>
			<CollapsibleContent className="overflow-hidden border-t border-border data-[state=closed]:animate-none">
				<ul className="divide-y divide-border">
					{comments.map((comment) => (
						<CommentRow key={comment.id} comment={comment} />
					))}
				</ul>
				<div className="flex items-center justify-end border-t border-border bg-muted/30 px-2.5 py-1.5">
					<Button
						type="button"
						size="xs"
						variant="outline"
						disabled={setResolution.isPending}
						onClick={() =>
							setResolution.mutate({
								workspaceId,
								threadId,
								resolved: !isResolved,
							})
						}
					>
						{setResolution.isPending && (
							<LuLoaderCircle className="size-3 animate-spin" />
						)}
						{isResolved ? "Unresolve" : "Resolve conversation"}
					</Button>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function CommentRow({ comment }: { comment: Comment }) {
	return (
		<li className="flex gap-2 px-2.5 py-2">
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
				<div className="diff-comment-body mt-1">
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

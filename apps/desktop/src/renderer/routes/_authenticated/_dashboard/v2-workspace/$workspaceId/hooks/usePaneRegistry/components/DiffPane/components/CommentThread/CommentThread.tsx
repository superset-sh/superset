import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronRight, LuExternalLink } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Comment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface CommentThreadProps {
	threadId: string;
	isResolved: boolean;
	url?: string;
	comments: Comment[];
}

export function CommentThread({
	isResolved,
	url,
	comments,
}: CommentThreadProps) {
	const [open, setOpen] = useState(!isResolved);
	const last = comments[comments.length - 1];
	const summary = last
		? `${last.authorLogin}${comments.length > 1 ? ` and ${comments.length - 1} other${comments.length - 1 === 1 ? "" : "s"}` : ""}`
		: "";

	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"my-1 w-full overflow-hidden rounded-md border border-border bg-card text-card-foreground",
				isResolved && "opacity-70",
			)}
		>
			<div className="flex items-center gap-2 px-2.5 py-1.5">
				<CollapsibleTrigger
					className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:text-foreground focus-visible:outline-none"
					aria-label={open ? "Collapse thread" : "Expand thread"}
				>
					<LuChevronRight
						className={cn(
							"size-3 shrink-0 text-muted-foreground transition-transform",
							open && "rotate-90",
						)}
					/>
					{last?.avatarUrl ? (
						<Avatar className="size-4 shrink-0">
							<AvatarImage src={last.avatarUrl} alt={last.authorLogin} />
							<AvatarFallback className="text-[9px]">
								{last.authorLogin.slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
					) : null}
					<span className="truncate font-medium text-foreground">
						{summary}
					</span>
					<span className="shrink-0 text-muted-foreground">
						{comments.length === 1
							? "1 comment"
							: `${comments.length} comments`}
					</span>
					{isResolved && (
						<span className="shrink-0 rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
				<div className="prose prose-xs dark:prose-invert mt-1 max-w-none break-words text-[13px] leading-relaxed">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{comment.body}
					</ReactMarkdown>
				</div>
			</div>
		</li>
	);
}

function formatRelative(ms: number): string {
	const delta = Date.now() - ms;
	const seconds = Math.round(delta / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.round(days / 365);
	return `${years}y ago`;
}

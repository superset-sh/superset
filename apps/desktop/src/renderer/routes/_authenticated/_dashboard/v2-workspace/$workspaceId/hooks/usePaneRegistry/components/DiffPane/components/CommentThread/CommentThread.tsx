import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { LuExternalLink } from "react-icons/lu";
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
	return (
		<div
			className={`my-1 mx-2 rounded-md border border-border bg-background/95 text-foreground shadow-sm ${
				isResolved ? "opacity-60" : ""
			}`}
		>
			<div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
				<span className="font-medium">
					{comments.length === 1 ? "1 comment" : `${comments.length} comments`}
				</span>
				{isResolved && (
					<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Resolved
					</span>
				)}
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noreferrer"
						className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
					>
						<LuExternalLink className="size-3" />
						Open on GitHub
					</a>
				)}
			</div>
			<ul className="divide-y divide-border">
				{comments.map((comment) => (
					<CommentRow key={comment.id} comment={comment} />
				))}
			</ul>
		</div>
	);
}

function CommentRow({ comment }: { comment: Comment }) {
	return (
		<li className="flex gap-2 px-3 py-2 text-sm">
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
					<span className="font-medium">{comment.authorLogin}</span>
					{comment.createdAt != null && (
						<time
							className="text-muted-foreground"
							dateTime={new Date(comment.createdAt).toISOString()}
						>
							{new Date(comment.createdAt).toLocaleString()}
						</time>
					)}
				</div>
				<div className="prose prose-sm dark:prose-invert max-w-none break-words">
					<ReactMarkdown remarkPlugins={[remarkGfm]}>
						{comment.body}
					</ReactMarkdown>
				</div>
			</div>
		</li>
	);
}

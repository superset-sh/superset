import type { PRCommentThread as PRCommentThreadType } from "@superset/local-db";
import { formatDistanceToNow } from "date-fns";
import { LuExternalLink } from "react-icons/lu";

interface PRCommentThreadProps {
	thread: PRCommentThreadType;
	className?: string;
}

export function PRCommentThread({ thread, className }: PRCommentThreadProps) {
	return (
		<div
			className={
				className ??
				"border border-blue-500/30 bg-blue-500/5 rounded-md mx-2 my-1 overflow-hidden"
			}
		>
			{thread.comments.map((comment) => (
				<div
					key={comment.id}
					className="px-3 py-2 border-b border-blue-500/10 last:border-b-0"
				>
					<div className="flex items-center gap-2 mb-1">
						<img
							src={comment.authorAvatarUrl}
							alt={comment.authorLogin}
							className="size-4 rounded-full"
						/>
						<span className="text-xs font-medium text-foreground">
							{comment.authorLogin}
						</span>
						<a
							href={comment.htmlUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-auto"
						>
							{formatDistanceToNow(new Date(comment.createdAt), {
								addSuffix: true,
							})}
							<LuExternalLink className="size-2.5" />
						</a>
					</div>
					<div className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
						{comment.body}
					</div>
				</div>
			))}
		</div>
	);
}

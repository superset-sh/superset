import type { PRCommentThread } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import { useParams } from "@tanstack/react-router";
import { useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { usePRComments } from "renderer/screens/main/hooks";
import { useScrollContext } from "../../ChangesContent";
import { PRCommentThread as PRCommentThreadComponent } from "../../ChangesContent/components/PRCommentThread";

interface CommentsViewProps {
	isExpandedView?: boolean;
}

function FileSection({
	path,
	threads,
	isExpandedView,
}: {
	path: string;
	threads: PRCommentThread[];
	isExpandedView?: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(true);
	const { scrollToFile } = useScrollContext();

	const handleFileClick = () => {
		if (isExpandedView) {
			scrollToFile(
				{ path, status: "modified", additions: 0, deletions: 0 },
				"against-base",
			);
		}
		setIsExpanded((prev) => !prev);
	};

	const totalComments = threads.reduce((sum, t) => sum + t.comments.length, 0);
	const fileName = path.split("/").pop() || path;

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={handleFileClick}
				className="flex items-center gap-1 w-full px-2 py-1.5 text-left hover:bg-accent/50 transition-colors"
			>
				{isExpanded ? (
					<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-3 shrink-0 text-muted-foreground" />
				)}
				<span className="text-xs font-medium truncate flex-1">{fileName}</span>
				<span className="text-[10px] text-muted-foreground shrink-0">
					{totalComments}
				</span>
			</button>
			{isExpanded && (
				<div className="px-1 pb-1">
					{threads.map((thread) => (
						<PRCommentThreadComponent
							key={thread.rootId}
							thread={thread}
							className="border border-blue-500/30 bg-blue-500/5 rounded-md mx-1 my-0.5 overflow-hidden"
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function CommentsView({ isExpandedView }: CommentsViewProps) {
	const { workspaceId } = useParams({ strict: false });
	const { commentsByFile, totalCount, isLoading } = usePRComments({
		workspaceId,
	});

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				Loading comments...
			</div>
		);
	}

	if (totalCount === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-4">
				No review comments
			</div>
		);
	}

	return (
		<div className={cn("flex-1 overflow-y-auto", isExpandedView && "text-sm")}>
			{Array.from(commentsByFile.entries()).map(([path, threads]) => (
				<FileSection
					key={path}
					path={path}
					threads={threads}
					isExpandedView={isExpandedView}
				/>
			))}
		</div>
	);
}

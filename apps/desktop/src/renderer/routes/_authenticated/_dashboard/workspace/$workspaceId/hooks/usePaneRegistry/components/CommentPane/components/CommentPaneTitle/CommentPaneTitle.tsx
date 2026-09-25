import type { RendererContext } from "@superset/panes";
import { cn } from "@superset/ui/utils";
import { MessageSquare } from "lucide-react";
import type { CommentPaneData, PaneViewerData } from "../../../../../../types";

interface CommentPaneTitleProps {
	context: RendererContext<PaneViewerData>;
}

export function CommentPaneTitle({ context }: CommentPaneTitleProps) {
	const data = context.pane.data as CommentPaneData;
	const { isActive } = context;

	return (
		<div className="flex min-w-0 flex-1 items-center gap-2">
			{data.avatarUrl ? (
				<img
					src={data.avatarUrl}
					alt=""
					className="size-3.5 shrink-0 rounded-full"
				/>
			) : (
				<MessageSquare className="size-3.5 shrink-0" />
			)}
			<span
				className={cn(
					"shrink-0 text-xs transition-colors duration-150",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
				title={data.authorLogin}
			>
				{data.authorLogin}
			</span>
			{data.path && (
				<span
					className="min-w-0 truncate text-xs text-muted-foreground"
					title={`${data.path}${data.line != null ? `:${data.line}` : ""}`}
				>
					{data.path}
					{data.line != null ? `:${data.line}` : ""}
				</span>
			)}
		</div>
	);
}

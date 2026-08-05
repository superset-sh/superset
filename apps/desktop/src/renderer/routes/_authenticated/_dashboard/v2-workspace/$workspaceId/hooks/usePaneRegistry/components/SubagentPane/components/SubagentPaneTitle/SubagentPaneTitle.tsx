import type { RendererContext } from "@superset/panes";
import { cn } from "@superset/ui/utils";
import { useMemo } from "react";
import type { PaneViewerData, SubagentPaneData } from "../../../../../../types";
import { useChatDisplay } from "../../../ChatPane/hooks/useWorkspaceChatDisplay";
import { resolveSubagentTitle } from "../../utils/resolveSubagentEntries";

interface SubagentPaneTitleProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function SubagentPaneTitle({
	context,
	workspaceId,
}: SubagentPaneTitleProps) {
	const data = context.pane.data as SubagentPaneData;
	const chat = useChatDisplay({
		sessionId: data.parentSessionId,
		workspaceId,
		enabled: Boolean(data.parentSessionId),
	});

	const title = useMemo(
		() =>
			resolveSubagentTitle({
				toolCallId: data.toolCallId,
				activeSubagents: chat.activeSubagents,
				messages: chat.messages ?? [],
				fallback: {
					task: data.task,
					agentType: data.agentType,
				},
			}),
		[
			chat.activeSubagents,
			chat.messages,
			data.agentType,
			data.task,
			data.toolCallId,
		],
	);

	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1.5 text-xs transition-colors duration-150",
				context.isActive ? "text-foreground" : "text-muted-foreground",
			)}
			title={data.task ?? title}
		>
			<span className="min-w-0 truncate">{title}</span>
		</div>
	);
}

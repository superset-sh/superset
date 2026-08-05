import type { RendererContext } from "@superset/panes";
import { useMemo } from "react";
import type { PaneViewerData, SubagentPaneData } from "../../../../types";
import { SubagentExecutionMessage } from "../ChatPane/components/WorkspaceChatInterface/components/ChatMessageList/components/SubagentExecutionMessage";
import { useChatDisplay } from "../ChatPane/hooks/useWorkspaceChatDisplay";
import { resolveSubagentEntries } from "./utils/resolveSubagentEntries";

interface SubagentPaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function SubagentPane({ context, workspaceId }: SubagentPaneProps) {
	const data = context.pane.data as SubagentPaneData;
	const chat = useChatDisplay({
		sessionId: data.parentSessionId,
		workspaceId,
		enabled: Boolean(data.parentSessionId),
	});

	const entries = useMemo(
		() =>
			resolveSubagentEntries({
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
		<div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
			<div className="min-h-0 flex-1 overflow-y-auto p-3 select-text">
				{entries.length > 0 ? (
					<SubagentExecutionMessage subagents={entries} inline />
				) : (
					<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
						Waiting for subagent activity…
					</div>
				)}
			</div>
		</div>
	);
}

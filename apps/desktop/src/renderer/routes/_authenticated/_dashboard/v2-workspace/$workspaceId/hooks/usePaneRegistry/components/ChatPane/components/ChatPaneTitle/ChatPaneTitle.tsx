import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { getV2NotificationSourcesForPane } from "renderer/stores/v2-notifications";
import { V2NotificationStatusIndicator } from "../../../../../../components/V2NotificationStatusIndicator";
import type { ChatPaneData, PaneViewerData } from "../../../../../../types";
import { useWorkspaceChatController } from "../../hooks/useWorkspaceChatController";
import { SessionSelector } from "../SessionSelector";

interface ChatPaneTitleProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function ChatPaneTitle({ context, workspaceId }: ChatPaneTitleProps) {
	const data = context.pane.data as ChatPaneData;
	const { sessionId } = data;
	const { actions } = context;

	const onSessionIdChange = useCallback(
		(nextSessionId: string | null) => {
			actions.updateData({ ...data, sessionId: nextSessionId });
		},
		[actions, data],
	);

	const {
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleDeleteSession,
	} = useWorkspaceChatController({
		workspaceId,
		sessionId,
		onSessionIdChange,
	});

	return (
		<div className="flex min-w-0 flex-1 items-center gap-1.5">
			<SessionSelector
				currentSessionId={sessionId}
				sessions={sessionItems}
				fallbackTitle="New Chat"
				onSelectSession={handleSelectSession}
				onNewChat={handleNewChat}
				onDeleteSession={handleDeleteSession}
			/>
			<V2NotificationStatusIndicator
				workspaceId={workspaceId}
				sources={getV2NotificationSourcesForPane(context.pane)}
			/>
		</div>
	);
}

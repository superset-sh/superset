import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useChatPreferencesStore } from "renderer/stores/chat-preferences";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import { ChatSurface } from "./components/ChatSurface";
import { SessionSelector } from "./components/SessionSelector";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function ChatPane({
	ctx,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const paneData = ctx.pane.data as ChatPaneData;
	const sessionId = paneData.sessionId;
	const initialLaunchConfig = paneData.launchConfig ?? null;

	const onSessionIdChange = useCallback(
		(nextSessionId: string | null) => {
			const current = ctx.pane.data as ChatPaneData;
			ctx.actions.updateData({
				...current,
				sessionId: nextSessionId,
			} as PaneViewerData);
		},
		[ctx],
	);

	const onConsumeLaunchConfig = useCallback(() => {
		const current = ctx.pane.data as ChatPaneData;
		if (!current.launchConfig) return;
		ctx.actions.updateData({
			...current,
			launchConfig: null,
		} as PaneViewerData);
	}, [ctx]);

	const {
		organizationId,
		workspacePath,
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleDeleteSession,
		getOrCreateSession,
	} = useWorkspaceChatController({
		onSessionIdChange,
		sessionId,
		workspaceId,
	});

	const chatV2OpencodeRebuild = useChatPreferencesStore(
		(state) => state.chatV2OpencodeRebuild,
	);

	return (
		<div className="flex h-full w-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<SessionSelector
					currentSessionId={sessionId}
					sessions={sessionItems}
					fallbackTitle="New Chat"
					onSelectSession={handleSelectSession}
					onNewChat={handleNewChat}
					onDeleteSession={handleDeleteSession}
				/>
			</div>

			<div className="min-h-0 flex-1">
				{chatV2OpencodeRebuild ? (
					<ChatSurface
						sessionId={sessionId}
						workspaceId={workspaceId}
						workspacePath={workspacePath}
						organizationId={organizationId}
						getOrCreateSession={getOrCreateSession}
						onNewChat={handleNewChat}
					/>
				) : (
					<WorkspaceChatInterface
						getOrCreateSession={getOrCreateSession}
						initialLaunchConfig={initialLaunchConfig}
						onConsumeLaunchConfig={onConsumeLaunchConfig}
						isFocused={ctx.isActive}
						onResetSession={handleNewChat}
						sessionId={sessionId}
						workspaceId={workspaceId}
						organizationId={organizationId}
						cwd={workspacePath}
					/>
				)}
			</div>
		</div>
	);
}

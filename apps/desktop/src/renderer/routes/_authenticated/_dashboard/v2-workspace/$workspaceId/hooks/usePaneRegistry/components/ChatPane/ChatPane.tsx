import type { WorkspaceStore } from "@superset/panes";
import type { ChatLaunchConfig } from "shared/tabs-types";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../types";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function ChatPane({
	onSessionIdChange,
	sessionId,
	workspaceId,
	initialLaunchConfig,
	onConsumeLaunchConfig,
	paneId = null,
	tabId = null,
	store = null,
}: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
	initialLaunchConfig?: ChatLaunchConfig | null;
	onConsumeLaunchConfig?: () => void;
	paneId?: string | null;
	tabId?: string | null;
	store?: StoreApi<WorkspaceStore<PaneViewerData>> | null;
}) {
	const { organizationId, workspacePath, handleNewChat, getOrCreateSession } =
		useWorkspaceChatController({
			onSessionIdChange,
			sessionId,
			workspaceId,
		});

	return (
		<WorkspaceChatInterface
			getOrCreateSession={getOrCreateSession}
			initialLaunchConfig={initialLaunchConfig ?? null}
			onConsumeLaunchConfig={onConsumeLaunchConfig}
			isFocused
			onResetSession={handleNewChat}
			sessionId={sessionId}
			workspaceId={workspaceId}
			organizationId={organizationId}
			cwd={workspacePath}
			paneId={paneId}
			tabId={tabId}
			store={store}
		/>
	);
}

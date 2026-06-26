import type { ChatLaunchConfig } from "shared/tabs-types";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function ChatPane({
	onSessionIdChange,
	sessionId,
	workspaceId,
	initialLaunchConfig,
	onConsumeLaunchConfig,
	onSaveDraft,
}: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
	initialLaunchConfig?: ChatLaunchConfig | null;
	onConsumeLaunchConfig?: () => void;
	onSaveDraft?: (draft: string | undefined) => void;
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
			onSaveDraft={onSaveDraft}
			isFocused
			onResetSession={handleNewChat}
			sessionId={sessionId}
			workspaceId={workspaceId}
			organizationId={organizationId}
			cwd={workspacePath}
		/>
	);
}

import { SessionSelector } from "./components/SessionSelector";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function WorkspaceChat({
	workspaceId,
	workspaceName,
}: {
	workspaceId: string;
	workspaceName: string;
}) {
	const {
		sessionId,
		launchConfig,
		organizationId,
		workspacePath,
		isSessionInitializing,
		hasCurrentSessionRecord,
		sessionItems,
		handleSelectSession,
		handleNewChat,
		handleStartFreshSession,
		handleDeleteSession,
		ensureCurrentSessionRecord,
		consumeLaunchConfig,
	} = useWorkspaceChatController({
		workspaceId,
	});

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border px-4 py-3">
				<SessionSelector
					currentSessionId={sessionId}
					sessions={sessionItems}
					fallbackTitle={workspaceName}
					isSessionInitializing={isSessionInitializing}
					onSelectSession={handleSelectSession}
					onNewChat={handleNewChat}
					onDeleteSession={handleDeleteSession}
				/>
			</div>

			<div className="min-h-0 flex-1">
				<WorkspaceChatInterface
					sessionId={sessionId}
					initialLaunchConfig={launchConfig}
					workspaceId={workspaceId}
					organizationId={organizationId}
					cwd={workspacePath}
					isFocused
					isSessionReady={hasCurrentSessionRecord}
					ensureSessionReady={ensureCurrentSessionRecord}
					onStartFreshSession={handleStartFreshSession}
					onConsumeLaunchConfig={consumeLaunchConfig}
				/>
			</div>
		</div>
	);
}

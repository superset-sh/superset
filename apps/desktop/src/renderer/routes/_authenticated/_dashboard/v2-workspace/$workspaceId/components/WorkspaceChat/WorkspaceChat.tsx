import { SessionSelector } from "./components/SessionSelector";
import { ChatPaneInterface as WorkspaceChatInterface } from "./components/WorkspaceChatInterface";
import { useWorkspaceChatController } from "./hooks/useWorkspaceChatController";

export function WorkspaceChat({
	onSessionIdChange,
	sessionId,
	workspaceId,
}: {
	onSessionIdChange: (sessionId: string | null) => void;
	sessionId: string | null;
	workspaceId: string;
}) {
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
				<WorkspaceChatInterface
					getOrCreateSession={getOrCreateSession}
					initialLaunchConfig={null}
					isFocused
					onResetSession={handleNewChat}
					sessionId={sessionId}
					workspaceId={workspaceId}
					organizationId={organizationId}
					cwd={workspacePath}
				/>
			</div>
		</div>
	);
}

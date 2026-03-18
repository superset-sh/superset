import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceChat/hooks/useWorkspaceChatDisplay";
import type { ChatLaunchConfig } from "shared/tabs-types";

export interface ChatRawSnapshot {
	sessionId: string | null;
	isRunning: boolean;
	currentMessage: UseChatDisplayReturn["currentMessage"] | null;
	messages: UseChatDisplayReturn["messages"];
	error: unknown;
}

export interface ChatPaneInterfaceProps {
	sessionId: string | null;
	initialLaunchConfig: ChatLaunchConfig | null;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	isSessionReady: boolean;
	ensureSessionReady: () => Promise<boolean>;
	onStartFreshSession: () => Promise<StartFreshSessionResult>;
	onConsumeLaunchConfig: () => void;
	onUserMessageSubmitted?: (message: string) => void;
	onRawSnapshotChange?: (snapshot: ChatRawSnapshot) => void;
}

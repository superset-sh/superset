import type { UseChatDisplayReturn } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/hooks/useWorkspaceChatDisplay";
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
	getOrCreateSession: () => Promise<string>;
	onResetSession: () => Promise<void>;
	onUserMessageSubmitted?: (message: string) => void;
	onRawSnapshotChange?: (snapshot: ChatRawSnapshot) => void;
}

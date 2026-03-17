import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";
import type { StartFreshSessionResult } from "renderer/components/Chat/ChatInterface/types";
import type { ChatMastraLaunchConfig } from "shared/tabs-types";

export interface ChatMastraRawSnapshot {
	sessionId: string | null;
	isRunning: boolean;
	currentMessage: UseMastraChatDisplayReturn["currentMessage"] | null;
	messages: UseMastraChatDisplayReturn["messages"];
	error: unknown;
}

export interface ChatMastraInterfaceProps {
	sessionId: string | null;
	initialLaunchConfig: ChatMastraLaunchConfig | null;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	isSessionReady: boolean;
	ensureSessionReady: () => Promise<boolean>;
	onStartFreshSession: () => Promise<StartFreshSessionResult>;
	onConsumeLaunchConfig: () => void;
	onUserMessageSubmitted?: (message: string) => void;
	onRawSnapshotChange?: (snapshot: ChatMastraRawSnapshot) => void;
}

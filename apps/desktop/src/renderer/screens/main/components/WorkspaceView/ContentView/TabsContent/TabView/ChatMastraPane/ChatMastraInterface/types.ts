import type { UseMastraChatDisplayReturn } from "@superset/chat-mastra/client";

export interface ChatMastraRawSnapshot {
	sessionId: string | null;
	isRunning: boolean;
	currentMessage: UseMastraChatDisplayReturn["currentMessage"] | null;
	messages: UseMastraChatDisplayReturn["messages"];
	error: unknown;
}

export interface ChatMastraInterfaceProps {
	sessionId: string | null;
	workspaceId: string;
	cwd: string;
	onStartFreshSession: () => Promise<{
		created: boolean;
		errorMessage?: string;
	}>;
	onRawSnapshotChange?: (snapshot: ChatMastraRawSnapshot) => void;
}

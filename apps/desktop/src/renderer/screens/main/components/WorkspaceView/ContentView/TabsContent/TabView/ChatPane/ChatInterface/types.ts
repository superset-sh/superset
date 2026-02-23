import type { UIMessage } from "ai";

export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export type InterruptedMessage = {
	id: string;
	sourceMessageId: string;
	parts: UIMessage["parts"];
};

export type InterruptedMessagePreview = {
	id: string;
	parts: UIMessage["parts"];
};

export interface ChatInterfaceProps {
	sessionId: string | null;
	sessionTitle: string | null;
	organizationId: string | null;
	deviceId: string | null;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

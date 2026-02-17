export interface ModelOption {
	id: string;
	name: string;
	provider: string;
}

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

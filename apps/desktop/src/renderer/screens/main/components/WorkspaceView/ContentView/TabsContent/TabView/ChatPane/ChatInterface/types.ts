export type { ModelOption } from "@superset/durable-session/react";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ChatInterfaceProps {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

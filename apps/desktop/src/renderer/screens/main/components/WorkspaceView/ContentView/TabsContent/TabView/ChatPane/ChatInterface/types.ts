export type { ModelOption } from "@superset/durable-session/react";

export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions";

export interface ChatInterfaceProps {
	sessionId: string | null;
	organizationId: string | null;
	deviceId: string | null;
	workspaceId: string;
	cwd: string;
	paneId: string;
	tabId: string;
}

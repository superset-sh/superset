/**
 * Shared notification types used by both main and renderer processes.
 * Kept in shared/ to avoid cross-boundary imports.
 */

export type NotificationSource =
	| { type: "terminal"; id: string }
	| { type: "chat"; id: string };

export interface NotificationSourceFocusTarget {
	workspaceId: string;
	source: NotificationSource;
}

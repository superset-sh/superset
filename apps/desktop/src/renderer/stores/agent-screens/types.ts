import type { MosaicNode } from "react-mosaic-component";

// Screen - workspace-bound, contains panes
export interface AgentScreen {
	id: string;
	workspaceId: string; // Tied to a workspace for terminal cwd/env
	organizationId: string;
	title: string;
	description?: string;
	layout: MosaicNode<string> | null; // Same as existing Tab.layout
	panes: Record<string, AgentPane>;
	createdAt: string;
	status: "composing" | "ready" | "viewed" | "dismissed";
}

// Pane types - extensible for future agent interactions
export type AgentPane = BrowserPane | TerminalPane | SummaryPane;

export interface BrowserPane {
	type: "browser";
	id: string;
	url: string;
	title?: string;
	// Future: canNavigate, canClick, canScroll, domSnapshot
}

export interface TerminalPane {
	type: "terminal";
	id: string;
	sessionId?: string; // Links to daemon terminal session
	// Future: canWrite, canResize, processInfo
}

export interface SummaryPane {
	type: "summary";
	id: string;
	content: string; // Markdown
	title?: string;
	// Future: canEdit, liveUpdate
}

// Notification card
export interface AgentNotification {
	id: string;
	screenId: string;
	organizationId: string;
	title: string;
	body?: string;
	priority: "normal" | "high" | "urgent";
	status: "pending" | "viewed" | "dismissed";
	createdAt: string;
}

// Create screen params
export interface CreateScreenParams {
	workspaceId: string;
	organizationId: string;
	title: string;
	description?: string;
}

// Add pane params
export interface AddBrowserPaneParams {
	screenId: string;
	paneId: string;
	url: string;
	title?: string;
}

export interface AddTerminalPaneParams {
	screenId: string;
	paneId: string;
	sessionId?: string;
}

export interface AddSummaryPaneParams {
	screenId: string;
	paneId: string;
	content: string;
	title?: string;
}

// Notify user params
export interface NotifyUserParams {
	screenId: string;
	organizationId: string;
	title: string;
	body?: string;
	priority?: "normal" | "high" | "urgent";
}

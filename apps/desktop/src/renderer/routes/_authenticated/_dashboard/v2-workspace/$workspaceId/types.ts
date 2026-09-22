import type { AgentIdentityId } from "@superset/shared/agent-catalog";
export interface FilePosition {
	line: number;
	column?: number;
}

export type OpenFile = (
	path: string,
	openInNewTab?: boolean,
	position?: FilePosition,
) => void;

export interface FilePaneData {
	pendingPosition?: FilePosition;
	filePath: string;
	mode: "editor" | "diff" | "preview";
	language?: string;
	viewId?: string;
	forceViewId?: string;
}

export interface TerminalPaneData {
	terminalId: string;
	/**
	 * Pane was inserted optimistically; the WS attach creates the session
	 * (`create=1`) instead of a pre-awaited HTTP mutation, which starves under
	 * Chromium's 6-per-origin socket pool. Safe to persist: the host only
	 * honors it when no session row exists at all, so a stale flag can't
	 * clobber a live or exited session.
	 */
	createOnAttach?: boolean;
}

export interface BrowserPaneData {
	url: string;
	pageTitle?: string;
	faviconUrl?: string | null;
}

export interface DevtoolsPaneData {
	targetPaneId: string;
	targetTitle: string;
}

export type DiffFocusSide = "deletions" | "additions";

export interface DiffPaneData {
	path: string;
	changeKey?: string;
	collapsedFiles: string[];
	/** Line to scroll to within `path`. `focusTick` bumps on each navigation
	 *  request so it can take precedence over an older cached scroll state. */
	focusLine?: number;
	focusSide?: DiffFocusSide;
	focusTick?: number;
}

export interface CommentPaneData {
	commentId: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	url?: string;
	path?: string;
	line?: number;
}

export interface PullRequestPaneData {
	prNumber: number;
	projectId?: string;
}

export interface PagePaneData {
	slug: string;
	pageId?: string;
	title?: string;
}

export interface ChatV3PaneData {
	sessionId: string | null;
}

export interface DesktopPaneData {
	kind: "desktop";
}

/**
 * Pointer to one subagent's transcript. The transcript itself is fetched
 * from the host on every read; only this pointer is persisted.
 */
export const SUBAGENT_PANE_KIND = "subagent";

export interface SubagentPaneData {
	terminalId: string;
	subagentId: string;
	agentId: AgentIdentityId;
	agentType?: string;
}

export type WorkspaceSearchKey =
	| "terminalId"
	| "focusRequestId"
	| "subagentTerminalId"
	| "subagentId"
	| "subagentAgentId"
	| "subagentType"
	| "openUrl"
	| "openUrlTarget"
	| "openUrlRequestId"
	| "pageId"
	| "pageSlug";

/**
 * Drops the search params a deep link arrived with, once the hook that owns
 * them has acted. Router history is persisted with its search params and
 * replayed at boot, so a link left in the URL fires again on every relaunch
 * and on every Back onto that entry.
 */
export type ConsumeSearch = (keys: WorkspaceSearchKey[]) => void;

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatV3PaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData
	| CommentPaneData
	| PullRequestPaneData
	| PagePaneData
	| DesktopPaneData
	| SubagentPaneData;

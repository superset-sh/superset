export interface FilePaneData {
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

export interface ChatV3PaneData {
	sessionId: string | null;
}

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatV3PaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData
	| CommentPaneData;

export interface FilePaneData {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	language?: string;
	viewId?: string;
	forceViewId?: string;
}

export interface TerminalPaneData {
	terminalId: string;
}

export interface ChatPaneData {
	sessionId: string | null;
	/**
	 * Transient initial launch config for a freshly-opened chat pane.
	 * Cleared by the chat pane on first consume. Set by the V2 workspace
	 * page's useConsumePendingLaunch when a pending chat launch exists.
	 */
	launchConfig?: {
		initialPrompt?: string;
		initialFiles?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
		model?: string;
		taskSlug?: string;
	} | null;
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

export interface DiffPaneData {
	path: string;
	collapsedFiles: string[];
	expandedFiles?: string[];
	/**
	 * Line number to scroll the diff to within the active file. Used by
	 * "open in diff" affordances (e.g. review-tab comment buttons) to
	 * jump directly to the line a thread is anchored on. Bumps a tick
	 * each time the same line is requested so the diff re-scrolls.
	 */
	focusLine?: number;
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

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatPaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData
	| CommentPaneData;

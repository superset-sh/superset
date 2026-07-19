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

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatPaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData
	| CommentPaneData;

export interface FilePaneData {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	hasChanges: boolean;
	language?: string;
}

export interface TerminalPaneData {
	terminalId: string;
}

export interface ChatPaneData {
	sessionId: string | null;
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

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatPaneData
	| BrowserPaneData
	| DevtoolsPaneData;

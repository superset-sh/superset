export interface FilePaneData {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	hasChanges: boolean;
	language?: string;
}

export interface TerminalPaneData {
	terminalId: string;
	initialCommand?: string;
}

export interface ChatPaneData {
	sessionId: string | null;
}

export interface BrowserPaneData {
	url: string;
	mode: "docs" | "preview" | "generic";
}

export interface DevtoolsPaneData {
	targetPaneId: string;
	targetTitle: string;
}

export interface DiffPaneData {
	path: string;
	category: "against-base" | "staged" | "unstaged";
	collapsedFiles: string[];
	scrollTop: number;
}

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatPaneData
	| BrowserPaneData
	| DevtoolsPaneData
	| DiffPaneData;

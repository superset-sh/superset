export interface FilePaneData {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	hasChanges: boolean;
	language?: string;
}

export interface TerminalPaneData {
	sessionKey: string;
	cwd: string;
	launchMode: "workspace-shell" | "command" | "agent";
	command?: string;
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

export type PaneViewerData =
	| FilePaneData
	| TerminalPaneData
	| ChatPaneData
	| BrowserPaneData
	| DevtoolsPaneData;

import { createPane, type PaneState } from "@superset/pane-layout";

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

export function createFilePane({
	title,
	filePath,
	mode,
	hasChanges,
	language,
	pinned,
}: {
	title: string;
	filePath: string;
	mode: FilePaneData["mode"];
	hasChanges: boolean;
	language?: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return createPane({
		kind: "file",
		titleOverride: title,
		pinned,
		data: {
			filePath,
			mode,
			hasChanges,
			language,
		},
	});
}

export function createTerminalPane({
	title,
	sessionKey,
	cwd,
	launchMode,
	command,
	pinned = true,
}: {
	title: string;
	sessionKey: string;
	cwd: string;
	launchMode: TerminalPaneData["launchMode"];
	command?: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return createPane({
		kind: "terminal",
		titleOverride: title,
		pinned,
		data: {
			sessionKey,
			cwd,
			launchMode,
			command,
		},
	});
}

export function createBrowserPane({
	title,
	url,
	mode,
	pinned = true,
}: {
	title: string;
	url: string;
	mode: BrowserPaneData["mode"];
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return createPane({
		kind: "browser",
		titleOverride: title,
		pinned,
		data: {
			url,
			mode,
		},
	});
}

export function createChatPane({
	title,
	sessionId,
	pinned = true,
}: {
	title: string;
	sessionId: string | null;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return createPane({
		kind: "chat",
		titleOverride: title,
		pinned,
		data: {
			sessionId,
		},
	});
}

export function createDevtoolsPane({
	title,
	targetPaneId,
	targetTitle,
	pinned = true,
}: {
	title: string;
	targetPaneId: string;
	targetTitle: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return createPane({
		kind: "devtools",
		titleOverride: title,
		pinned,
		data: {
			targetPaneId,
			targetTitle,
		},
	});
}

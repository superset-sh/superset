import {
	createWorkbenchState,
	createWorkbenchWindow,
	workbenchReducer,
	type WorkbenchPane,
	type WorkbenchState,
} from "@superset/pane-layout";

export type PaneKind = "terminal" | "browser" | "file" | "chat" | "devtools";

interface BasePaneConfig<K extends PaneKind> {
	id: string;
	kind: K;
	title: string;
	isPinned?: boolean;
}

export type FilePaneConfig = BasePaneConfig<"file"> & {
	filePath: string;
	mode: "editor" | "diff" | "preview";
	hasChanges: boolean;
	language?: string;
};

export type TerminalPaneConfig = BasePaneConfig<"terminal"> & {
	sessionKey: string;
	cwd: string;
	launchMode: "workspace-shell" | "command" | "agent";
	command?: string;
	isPersistent: boolean;
};

export type ChatPaneConfig = BasePaneConfig<"chat"> & {
	sessionId: string | null;
	model?: string;
	hasDraft: boolean;
};

export type BrowserPaneConfig = BasePaneConfig<"browser"> & {
	url: string;
	mode: "docs" | "preview" | "generic";
};

export type DevtoolsPaneConfig = BasePaneConfig<"devtools"> & {
	targetPaneId: string;
	targetTitle: string;
};

export type PaneConfig =
	| FilePaneConfig
	| TerminalPaneConfig
	| ChatPaneConfig
	| BrowserPaneConfig
	| DevtoolsPaneConfig;

export function createStubPaneViewerState({
	workspaceBranch,
	workspaceName,
}: {
	workspaceBranch: string;
	workspaceName: string;
}): WorkbenchState<PaneConfig> {
	const filePanePrimary: FilePaneConfig = {
		id: "pane-file-app",
		kind: "file",
		title: "apps/desktop/package.json",
		filePath: "apps/desktop/package.json",
		mode: "editor",
		hasChanges: true,
		language: "json",
		isPinned: true,
	};

	const filePaneSecondary: FilePaneConfig = {
		id: "pane-file-workspace",
		kind: "file",
		title: "WorkspaceFiles.tsx",
		filePath:
			"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceFiles/WorkspaceFiles.tsx",
		mode: "diff",
		hasChanges: false,
		language: "tsx",
		isPinned: true,
	};

	const terminalPane: TerminalPaneConfig = {
		id: "pane-terminal-main",
		kind: "terminal",
		title: "Terminal",
		sessionKey: `${workspaceBranch}:main`,
		cwd: `/workspace/${workspaceName}`,
		launchMode: "workspace-shell",
		isPersistent: true,
		isPinned: true,
	};

	const browserPane: BrowserPaneConfig = {
		id: "pane-browser-preview",
		kind: "browser",
		title: "Preview",
		url: "http://localhost:3000",
		mode: "preview",
		isPinned: true,
	};

	const chatPane: ChatPaneConfig = {
		id: "pane-chat-main",
		kind: "chat",
		title: "Chat",
		sessionId: "chat-session-stub",
		model: "gpt-5.4",
		hasDraft: true,
		isPinned: true,
	};

	const devtoolsPane: DevtoolsPaneConfig = {
		id: "pane-devtools-preview",
		kind: "devtools",
		title: "Devtools",
		targetPaneId: browserPane.id,
		targetTitle: browserPane.title,
		isPinned: true,
	};

	const asWorkbenchPane = (pane: PaneConfig): WorkbenchPane<PaneConfig> => ({
		id: pane.id,
		title: pane.title,
		kind: pane.kind,
		data: pane,
		closeable: true,
	});

	const mainWindow = createWorkbenchWindow({
		id: "window-main",
		title: workspaceName,
		groupId: "group-files",
		panes: [
			asWorkbenchPane(filePanePrimary),
			asWorkbenchPane(filePaneSecondary),
		],
	});

	let state = createWorkbenchState({
		windows: [mainWindow],
		activeWindowId: mainWindow.id,
	});

	state = workbenchReducer(state, {
		type: "splitGroup",
		windowId: mainWindow.id,
		groupId: "group-files",
		direction: "horizontal",
		newGroup: {
			id: "group-browser-chat",
			panes: [asWorkbenchPane(browserPane), asWorkbenchPane(chatPane)],
		},
		sizes: [52, 48],
	});

	state = workbenchReducer(state, {
		type: "splitGroup",
		windowId: mainWindow.id,
		groupId: "group-browser-chat",
		direction: "vertical",
		newGroup: {
			id: "group-runtime",
			panes: [asWorkbenchPane(terminalPane), asWorkbenchPane(devtoolsPane)],
		},
		sizes: [58, 42],
	});

	state = workbenchReducer(state, {
		type: "setActiveGroup",
		windowId: mainWindow.id,
		groupId: "group-files",
	});

	return state;
}

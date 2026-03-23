import {
	createPaneRoot,
	createPaneWorkspaceState,
	type PaneRootState,
	type PaneState,
	type PaneWorkspaceState,
} from "@superset/pane-layout";

export type PaneKind = "terminal" | "browser" | "file" | "chat" | "devtools";

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
	model?: string;
	hasDraft: boolean;
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
	id,
	title,
	filePath,
	mode,
	hasChanges,
	language,
	pinned,
}: {
	id: string;
	title: string;
	filePath: string;
	mode: FilePaneData["mode"];
	hasChanges: boolean;
	language?: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return {
		id,
		kind: "file",
		titleOverride: title,
		pinned,
		data: {
			filePath,
			mode,
			hasChanges,
			language,
		},
	};
}

export function createTerminalPane({
	id,
	title,
	sessionKey,
	cwd,
	launchMode,
	command,
	pinned = true,
}: {
	id: string;
	title: string;
	sessionKey: string;
	cwd: string;
	launchMode: TerminalPaneData["launchMode"];
	command?: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return {
		id,
		kind: "terminal",
		titleOverride: title,
		pinned,
		data: {
			sessionKey,
			cwd,
			launchMode,
			command,
		},
	};
}

export function createBrowserPane({
	id,
	title,
	url,
	mode,
	pinned = true,
}: {
	id: string;
	title: string;
	url: string;
	mode: BrowserPaneData["mode"];
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return {
		id,
		kind: "browser",
		titleOverride: title,
		pinned,
		data: {
			url,
			mode,
		},
	};
}

export function createChatPane({
	id,
	title,
	sessionId,
	model,
	hasDraft,
	pinned = true,
}: {
	id: string;
	title: string;
	sessionId: string | null;
	model?: string;
	hasDraft: boolean;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return {
		id,
		kind: "chat",
		titleOverride: title,
		pinned,
		data: {
			sessionId,
			model,
			hasDraft,
		},
	};
}

export function createDevtoolsPane({
	id,
	title,
	targetPaneId,
	targetTitle,
	pinned = true,
}: {
	id: string;
	title: string;
	targetPaneId: string;
	targetTitle: string;
	pinned?: boolean;
}): PaneState<PaneViewerData> {
	return {
		id,
		kind: "devtools",
		titleOverride: title,
		pinned,
		data: {
			targetPaneId,
			targetTitle,
		},
	};
}

export function createPaneViewerState({
	workspaceBranch,
	workspaceName,
}: {
	workspaceBranch: string;
	workspaceName: string;
}): PaneWorkspaceState<PaneViewerData> {
	const previewPane = createFilePane({
		id: "pane-file-preview",
		title: "apps/desktop/package.json",
		filePath: "apps/desktop/package.json",
		mode: "editor",
		hasChanges: true,
		language: "json",
		pinned: false,
	});

	const pinnedFilePane = createFilePane({
		id: "pane-file-pinned",
		title: "WorkspaceFiles.tsx",
		filePath:
			"apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceFiles/WorkspaceFiles.tsx",
		mode: "diff",
		hasChanges: false,
		language: "tsx",
		pinned: true,
	});

	const browserPane = createBrowserPane({
		id: "pane-browser-preview",
		title: "Preview",
		url: "http://localhost:3000",
		mode: "preview",
	});

	const chatPane = createChatPane({
		id: "pane-chat-main",
		title: "Chat",
		sessionId: "chat-session-stub",
		model: "gpt-5.4",
		hasDraft: true,
	});

	const terminalPane = createTerminalPane({
		id: "pane-terminal-main",
		title: "Terminal",
		sessionKey: `${workspaceBranch}:main`,
		cwd: `/workspace/${workspaceName}`,
		launchMode: "workspace-shell",
	});

	const devtoolsPane = createDevtoolsPane({
		id: "pane-devtools-preview",
		title: "Devtools",
		targetPaneId: browserPane.id,
		targetTitle: browserPane.titleOverride ?? "Preview",
	});

	const mainRoot: PaneRootState<PaneViewerData> = {
		id: "root-main",
		titleOverride: workspaceName,
		activeGroupId: "group-files",
		root: {
			type: "split",
			id: "split-main",
			direction: "horizontal",
			sizes: [54, 46],
			children: [
				{
					type: "group",
					id: "group-files",
					activePaneId: previewPane.id,
					panes: [previewPane, pinnedFilePane],
				},
				{
					type: "split",
					id: "split-runtime",
					direction: "vertical",
					sizes: [58, 42],
					children: [
						{
							type: "group",
							id: "group-browser-chat",
							activePaneId: browserPane.id,
							panes: [browserPane, chatPane],
						},
						{
							type: "group",
							id: "group-runtime",
							activePaneId: terminalPane.id,
							panes: [terminalPane, devtoolsPane],
						},
					],
				},
			],
		},
	};

	return createPaneWorkspaceState({
		roots: [
			mainRoot,
			createPaneRoot({
				id: "root-chat",
				titleOverride: "Chat",
				groupId: "group-chat",
				panes: [
					createChatPane({
						id: "pane-chat-secondary",
						title: "Chat",
						sessionId: null,
						model: "gpt-5.4-mini",
						hasDraft: false,
					}),
				],
			}),
		],
		activeRootId: mainRoot.id,
	});
}

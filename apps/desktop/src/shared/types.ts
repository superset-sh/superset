import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

import type { registerRoute } from "lib/electron-router-dom";

export type BrowserWindowOrNull = Electron.BrowserWindow | null;

type Route = Parameters<typeof registerRoute>[0];

export interface WindowProps extends Electron.BrowserWindowConstructorOptions {
	id: Route["id"];
	query?: Route["query"];
}

export interface WindowCreationByIPC {
	channel: string;
	window(): BrowserWindowOrNull;
	callback(window: BrowserWindow, event: IpcMainInvokeEvent): void;
}

// Workspace types - Simple Grid Layout
export interface GridTerminal {
	id: string;
	command?: string | null;
	cwd?: string; // Current working directory
	row: number;
	col: number;
	rowSpan?: number;
	colSpan?: number;
}

export interface GridLayout {
	rows: number;
	cols: number;
	terminals: GridTerminal[];
}

export interface Tab {
	id: string;
	name: string;
	layout: GridLayout;
	createdAt: string;
}

export interface TabGroup {
	id: string;
	name: string;
	tabs: Tab[];
	createdAt: string;
}

export interface Worktree {
	id: string;
	branch: string;
	path: string;
	tabGroups: TabGroup[];
	createdAt: string;
}

export interface Workspace {
	id: string;
	name: string;
	repoPath: string;
	branch: string;
	worktrees: Worktree[];
	createdAt: string;
	updatedAt: string;
}

export interface WorkspaceConfig {
	workspaces: Workspace[];
	lastOpenedWorkspaceId: string | null;
}

export interface CreateWorkspaceInput {
	name: string;
	repoPath: string;
	branch: string;
}

export interface CreateWorktreeInput {
	workspaceId: string;
	branch: string;
	createBranch?: boolean;
}

export interface CreateTabGroupInput {
	workspaceId: string;
	worktreeId: string;
	name: string;
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	tabGroupId: string;
	name: string;
	layout: GridLayout;
}

export interface UpdateWorkspaceInput {
	id: string;
	name?: string;
}

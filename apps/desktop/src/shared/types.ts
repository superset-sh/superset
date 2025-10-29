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

// ========================================
// IPC Contract Types
// These types define the shape of data sent across IPC boundaries
// ========================================

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
	templateId: string; // ID of template to instantiate
}

export interface CreateTabInput {
	workspaceId: string;
	worktreeId: string;
	tabGroupId: string;
	name: string;
	command?: string | null;
	row: number;
	col: number;
	rowSpan?: number;
	colSpan?: number;
}

export interface UpdateWorkspaceInput {
	id: string;
	name?: string;
}

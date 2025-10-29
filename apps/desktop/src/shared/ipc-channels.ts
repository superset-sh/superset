/**
 * Type-safe IPC channel definitions
 *
 * This file defines all IPC channels with their request/response types.
 * Use these types in both main and renderer processes for type safety.
 */

import type {
	CreateTabGroupInput,
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	UpdateWorkspaceInput,
} from "./types";
import type { Tab, TabGroup, Workspace, Worktree } from "./runtime-types";

/**
 * Standard response format for operations
 */
export interface IpcResponse<T = void> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Define all IPC channels with their request and response types
 */
export interface IpcChannels {
	// Workspace operations
	"workspace-list": {
		request: void;
		response: Workspace[];
	};
	"workspace-get": {
		request: string; // workspace ID
		response: Workspace | null;
	};
	"workspace-create": {
		request: CreateWorkspaceInput;
		response: IpcResponse<Workspace>;
	};
	"workspace-update": {
		request: UpdateWorkspaceInput;
		response: IpcResponse<Workspace>;
	};
	"workspace-delete": {
		request: { id: string; removeWorktree?: boolean };
		response: IpcResponse;
	};
	"workspace-get-last-opened": {
		request: void;
		response: Workspace | null;
	};
	"workspace-scan-worktrees": {
		request: string; // workspace ID
		response: IpcResponse<{ imported: number }>;
	};
	"workspace-get-active-selection": {
		request: void;
		response: {
			worktreeId: string | null;
			tabGroupId: string | null;
			tabId: string | null;
		};
	};
	"workspace-set-active-selection": {
		request: {
			worktreeId: string | null;
			tabGroupId: string | null;
			tabId: string | null;
		};
		response: boolean;
	};

	// Worktree operations
	"worktree-create": {
		request: CreateWorktreeInput;
		response: IpcResponse<Worktree>;
	};

	// Tab group operations
	"tab-group-create": {
		request: CreateTabGroupInput;
		response: IpcResponse<TabGroup>;
	};
	"tab-group-reorder": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabGroupIds: string[];
		};
		response: IpcResponse;
	};

	// Tab operations
	"tab-create": {
		request: CreateTabInput;
		response: IpcResponse<Tab>;
	};
	"tab-reorder": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabGroupId: string;
			tabIds: string[];
		};
		response: IpcResponse;
	};
	"tab-move-to-group": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			sourceTabGroupId: string;
			targetTabGroupId: string;
			targetIndex: number;
		};
		response: IpcResponse;
	};

	// Terminal operations
	"terminal-create": {
		request: {
			id?: string;
			cols?: number;
			rows?: number;
			cwd?: string;
		};
		response: { id: string; pid: number };
	};
	"terminal-execute-command": {
		request: { id: string; command: string };
		response: void;
	};
	"terminal-get-history": {
		request: string; // terminal ID
		response: string | undefined;
	};

	// Update terminal CWD in workspace config
	"workspace-update-terminal-cwd": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabGroupId: string;
			tabId: string;
			cwd: string;
		};
		response: boolean;
	};

	// External operations
	"open-external": {
		request: string; // URL
		response: void;
	};
}

/**
 * Type-safe IPC channel names
 */
export type IpcChannelName = keyof IpcChannels;

/**
 * Get request type for a channel
 */
export type IpcRequest<T extends IpcChannelName> = IpcChannels[T]["request"];

/**
 * Get response type for a channel
 */
export type IpcResponse_<T extends IpcChannelName> = IpcChannels[T]["response"];

/**
 * Type guard to check if a channel name is valid
 */
export function isValidChannel(channel: string): channel is IpcChannelName {
	const validChannels: IpcChannelName[] = [
		"workspace-list",
		"workspace-get",
		"workspace-create",
		"workspace-update",
		"workspace-delete",
		"workspace-get-last-opened",
		"workspace-scan-worktrees",
		"workspace-get-active-selection",
		"workspace-set-active-selection",
		"workspace-update-terminal-cwd",
		"worktree-create",
		"tab-group-create",
		"tab-group-reorder",
		"tab-create",
		"tab-reorder",
		"tab-move-to-group",
		"terminal-create",
		"terminal-execute-command",
		"terminal-get-history",
		"open-external",
	];
	return validChannels.includes(channel as IpcChannelName);
}

/**
 * Type-safe IPC channel definitions
 *
 * This file defines all IPC channels with their request/response types.
 * Use these types in both main and renderer processes for type safety.
 */

import type {
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	MosaicNode,
	Tab,
	UpdateWorkspaceInput,
	Workspace,
	Worktree,
} from "./types";

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
		response: { success: boolean; imported?: number; error?: string };
	};
	"workspace-get-active-selection": {
		request: string; // workspace ID
		response: {
			worktreeId: string | null;
			tabId: string | null;
		} | null;
	};
	"workspace-set-active-selection": {
		request: {
			workspaceId: string;
			worktreeId: string | null;
			tabId: string | null;
		};
		response: boolean;
	};
	"workspace-get-active-workspace-id": {
		request: void;
		response: string | null;
	};
	"workspace-set-active-workspace-id": {
		request: string; // workspace ID
		response: boolean;
	};
	"workspace-list-branches": {
		request: string; // workspace ID
		response: { branches: string[]; currentBranch: string | null };
	};

	// Worktree operations
	"worktree-create": {
		request: CreateWorktreeInput;
		response: {
			success: boolean;
			worktree?: Worktree;
			setupResult?: import("./types").SetupResult;
			error?: string;
		};
	};
	"worktree-remove": {
		request: { workspaceId: string; worktreeId: string };
		response: IpcResponse;
	};
	"worktree-can-merge": {
		request: { workspaceId: string; worktreeId: string };
		response: {
			canMerge: boolean;
			reason?: string;
			isActiveWorktree?: boolean;
			hasUncommittedChanges?: boolean;
		};
	};
	"worktree-merge": {
		request: { workspaceId: string; worktreeId: string };
		response: IpcResponse;
	};
	"worktree-get-path": {
		request: { workspaceId: string; worktreeId: string };
		response: string | null;
	};
	"worktree-check-settings": {
		request: { workspaceId: string; worktreeId: string };
		response: { success: boolean; exists?: boolean; error?: string };
	};
	"worktree-open-settings": {
		request: {
			workspaceId: string;
			worktreeId: string;
			createIfMissing?: boolean;
		};
		response: { success: boolean; created?: boolean; error?: string };
	};

	// Tab operations
	"tab-create": {
		request: CreateTabInput;
		response: { success: boolean; tab?: Tab; error?: string };
	};
	"tab-delete": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
		};
		response: IpcResponse;
	};
	"tab-reorder": {
		request: {
			workspaceId: string;
			worktreeId: string;
			parentTabId?: string; // Optional parent tab ID (for reordering within a group)
			tabIds: string[];
		};
		response: IpcResponse;
	};
	"tab-move": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			sourceParentTabId?: string; // Optional source parent tab ID
			targetParentTabId?: string; // Optional target parent tab ID
			targetIndex: number;
		};
		response: IpcResponse;
	};
	"tab-update-mosaic-tree": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string; // The group tab ID
			mosaicTree: MosaicNode<string> | null | undefined;
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
	"open-app-settings": {
		request: void;
		response: { success: boolean; error?: string };
	};

	// Port detection and proxy operations
	"workspace-set-ports": {
		request: {
			workspaceId: string;
			ports: Array<number | { name: string; port: number }>;
		};
		response: IpcResponse;
	};
	"workspace-get-detected-ports": {
		request: { worktreeId: string };
		response: Record<string, number>;
	};
	"proxy-get-status": {
		request: void;
		response: Array<{
			canonical: number;
			target?: number;
			service?: string;
			active: boolean;
		}>;
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
		"workspace-get-active-workspace-id",
		"workspace-set-active-workspace-id",
		"workspace-list-branches",
		"workspace-update-terminal-cwd",
		"worktree-create",
		"worktree-remove",
		"worktree-can-merge",
		"worktree-merge",
		"worktree-get-path",
		"worktree-check-settings",
		"worktree-open-settings",
		"open-app-settings",
		"tab-create",
		"tab-delete",
		"tab-reorder",
		"tab-move",
		"tab-update-mosaic-tree",
		"terminal-create",
		"terminal-execute-command",
		"terminal-get-history",
		"open-external",
		"workspace-set-ports",
		"workspace-get-detected-ports",
		"proxy-get-status",
	];
	return validChannels.includes(channel as IpcChannelName);
}

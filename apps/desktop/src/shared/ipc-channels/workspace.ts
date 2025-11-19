/**
 * Workspace-related IPC channels
 */

import type {
	CreateWorkspaceInput,
	UpdateWorkspaceInput,
	Workspace,
} from "../types";
import type { IpcResponse, NoRequest } from "./types";

export interface WorkspaceChannels {
	"workspace-list": {
		request: NoRequest;
		response: Workspace[];
	};

	"workspace-get": {
		request: string;
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
		request: NoRequest;
		response: Workspace | null;
	};

	"workspace-scan-worktrees": {
		request: string;
		response: { success: boolean; imported?: number; error?: string };
	};

	"workspace-list-branches": {
		request: string;
		response: { branches: string[]; currentBranch: string | null };
	};

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

	"workspace-update-terminal-cwd": {
		request: {
			workspaceId: string;
			worktreeId: string;
			tabId: string;
			cwd: string;
		};
		response: boolean;
	};

	// Workspace Selection & State
	"workspace-get-active-selection": {
		request: string;
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
		request: NoRequest;
		response: string | null;
	};

	"workspace-set-active-workspace-id": {
		request: string;
		response: boolean;
	};

	"workspace-get-window-workspace-id": {
		request: NoRequest;
		response: string | null;
	};

	"workspace-set-window-workspace-id": {
		request: string | null;
		response: boolean;
	};

	// New architecture: Workspace activation and composition
	"workspace-activate": {
		request: { workspaceId: string };
		response: IpcResponse<{
			workspace: {
				id: string;
				type: "local";
				environmentId: string;
				path: string;
			};
			worktrees: Array<{
				path: string;
				branch: string;
				currentBranch: string;
				bare: boolean;
				merged?: boolean;
				ui: {
					path: string;
					branch: string;
					description?: string;
					prUrl?: string;
					merged?: boolean;
					tabs: Array<{
						id: string;
						name: string;
						type: string;
						cwd?: string;
						url?: string;
						command?: string | null;
						tabs?: unknown[];
						mosaicTree?: unknown;
						createdAt: string;
					}>;
					mosaicTree?: unknown;
					activeTabId: string | null;
					updatedAt: string;
				};
			}>;
			ui: {
				activeWorktreePath: string | null;
				activeTabId: string | null;
			};
		}>;
	};

	"workspace-rescan": {
		request: { workspaceId: string };
		response: IpcResponse<{
			added: Array<{
				path: string;
				branch: string;
				bare: boolean;
				currentBranch: string;
				merged?: boolean;
			}>;
			removed: Array<{
				path: string;
				branch: string;
				bare: boolean;
				currentBranch: string;
				merged?: boolean;
			}>;
			changed: Array<{
				old: {
					path: string;
					branch: string;
					bare: boolean;
					currentBranch: string;
					merged?: boolean;
				};
				new: {
					path: string;
					branch: string;
					bare: boolean;
					currentBranch: string;
					merged?: boolean;
				};
			}>;
			state: {
				workspace: {
					id: string;
					type: "local";
					environmentId: string;
					path: string;
				};
				worktrees: Array<{
					path: string;
					branch: string;
					currentBranch: string;
					bare: boolean;
					merged?: boolean;
					ui: {
						path: string;
						branch: string;
						description?: string;
						prUrl?: string;
						merged?: boolean;
						tabs: unknown[];
						mosaicTree?: unknown;
						activeTabId: string | null;
						updatedAt: string;
					};
				}>;
				ui: {
					activeWorktreePath: string | null;
					activeTabId: string | null;
				};
			};
		}>;
	};
}

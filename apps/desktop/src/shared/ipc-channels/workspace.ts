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
}


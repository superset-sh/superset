/**
 * Worktree-related IPC channels
 */

import type { CloudSandbox, CreateWorktreeInput, Worktree } from "../types";
import type { IpcResponse, SuccessResponse } from "./types";

export interface WorktreeChannels {
	"worktree-create": {
		request: CreateWorktreeInput;
		response: {
			success: boolean;
			worktree?: Worktree;
			error?: string;
		};
	};

	"worktree-remove": {
		request: { workspaceId: string; worktreeId: string };
		response: IpcResponse;
	};

	"worktree-get-path": {
		request: { workspaceId: string; worktreeId: string };
		response: string | null;
	};

	"worktree-update-description": {
		request: {
			workspaceId: string;
			worktreeId: string;
			description: string;
		};
		response: IpcResponse;
	};

	// Worktree Merge Operations
	"worktree-can-merge": {
		request: {
			workspaceId: string;
			worktreeId: string;
			targetWorktreeId?: string;
		};
		response: {
			canMerge: boolean;
			reason?: string;
			isActiveWorktree?: boolean;
			hasUncommittedChanges?: boolean;
			targetHasUncommittedChanges?: boolean;
			sourceHasUncommittedChanges?: boolean;
		};
	};

	"worktree-merge": {
		request: {
			workspaceId: string;
			worktreeId: string;
			targetWorktreeId?: string;
		};
		response: IpcResponse;
	};

	"worktree-can-remove": {
		request: { workspaceId: string; worktreeId: string };
		response: {
			success: boolean;
			canRemove?: boolean;
			hasUncommittedChanges?: boolean;
			error?: string;
		};
	};

	// Worktree Settings
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

	// Worktree Git Operations
	"worktree-get-git-status": {
		request: { workspaceId: string; worktreeId: string };
		response: {
			success: boolean;
			status?: {
				branch: string;
				ahead: number;
				behind: number;
				files: {
					staged: Array<{ path: string; status: string }>;
					unstaged: Array<{ path: string; status: string }>;
					untracked: Array<{ path: string }>;
				};
				diffAgainstMain: string;
				isMerging: boolean;
				isRebasing: boolean;
				conflictFiles: string[];
			};
			error?: string;
		};
	};

	"worktree-get-git-diff": {
		request: { workspaceId: string; worktreeId: string };
		response: {
			success: boolean;
			diff?: {
				files: Array<{
					id: string;
					fileName: string;
					filePath: string;
					status: "added" | "deleted" | "modified" | "renamed";
					oldPath?: string;
					additions: number;
					deletions: number;
					changes: Array<{
						type: "added" | "removed" | "modified" | "unchanged";
						oldLineNumber: number | null;
						newLineNumber: number | null;
						content: string;
					}>;
				}>;
			};
			error?: string;
		};
	};

	"worktree-get-git-diff-file-list": {
		request: { workspaceId: string; worktreeId: string };
		response: {
			success: boolean;
			files?: Array<{
				id: string;
				fileName: string;
				filePath: string;
				status: "added" | "deleted" | "modified" | "renamed";
				oldPath?: string;
				additions: number;
				deletions: number;
			}>;
			error?: string;
		};
	};

	"worktree-get-git-diff-file": {
		request: {
			workspaceId: string;
			worktreeId: string;
			filePath: string;
			oldPath?: string;
			status: "added" | "deleted" | "modified" | "renamed";
		};
		response: {
			success: boolean;
			changes?: Array<{
				type: "added" | "removed" | "modified" | "unchanged";
				oldLineNumber: number | null;
				newLineNumber: number | null;
				content: string;
			}>;
			error?: string;
		};
	};

	// Worktree PR Operations
	"worktree-create-pr": {
		request: { workspaceId: string; worktreeId: string };
		response: { success: boolean; prUrl?: string; error?: string };
	};

	"worktree-merge-pr": {
		request: { workspaceId: string; worktreeId: string };
		response: SuccessResponse;
	};

	// Cloud sandbox operations
	"cloud-sandbox-create": {
		request: {
			name: string;
			projectId: string; // Project ID - main process will look up the repo path
			taskDescription?: string;
		};
		response: {
			success: boolean;
			sandbox?: CloudSandbox;
			error?: string;
		};
	};

	"cloud-sandbox-delete": {
		request: { sandboxId: string };
		response: {
			success: boolean;
			error?: string;
		};
	};

	"cloud-sandbox-list": {
		request: Record<string, never>;
		response: {
			success: boolean;
			sandboxes?: CloudSandbox[];
			error?: string;
		};
	};

	"cloud-sandbox-status": {
		request: { sandboxId: string };
		response: {
			success: boolean;
			status?: "running" | "stopped" | "error";
			error?: string;
		};
	};

	"worktree-set-cloud-sandbox": {
		request: {
			worktreeId: string;
			cloudSandbox: CloudSandbox | null;
		};
		response: {
			success: boolean;
			error?: string;
		};
	};
}

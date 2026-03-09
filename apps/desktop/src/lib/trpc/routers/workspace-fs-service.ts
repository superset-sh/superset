import {
	createWorkspaceFsHostService,
	toFileSystemChangeEvent,
	WorkspaceFsWatcherManager,
	type WorkspaceFsPathError,
	type WorkspaceFsWatchEvent,
} from "@superset/workspace-fs/host";
import { shell } from "electron";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import { assertRegisteredWorktree } from "./changes/security/path-validation";
import { getWorkspace } from "./workspaces/utils/db-helpers";
import { execWithShellEnv } from "./workspaces/utils/shell-env";
import { getWorkspacePath } from "./workspaces/utils/worktree";

const filesystemWatcherManager = new WorkspaceFsWatcherManager();

export function resolveWorkspaceRootPath(workspaceId: string): string {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		throw new Error(`Workspace not found: ${workspaceId}`);
	}

	const rootPath = getWorkspacePath(workspace);
	if (!rootPath) {
		throw new Error(`Workspace path not found: ${workspaceId}`);
	}

	return rootPath;
}

function resolveRegisteredWorktreeRootPath(worktreePath: string): string {
	assertRegisteredWorktree(worktreePath);
	return worktreePath;
}

const sharedHostServiceOptions = {
	runRipgrep: async (args: string[], options: { cwd: string; maxBuffer: number }) => {
		const result = await execWithShellEnv("rg", args, {
			cwd: options.cwd,
			maxBuffer: options.maxBuffer,
			windowsHide: true,
		});

		return { stdout: result.stdout };
	},
};

export const workspaceFsService = createWorkspaceFsHostService({
	resolveRootPath: resolveWorkspaceRootPath,
	watcherManager: filesystemWatcherManager,
	trashItem: async (absolutePath) => {
		await shell.trashItem(absolutePath);
	},
	...sharedHostServiceOptions,
});

export const registeredWorktreeFsService = createWorkspaceFsHostService({
	resolveRootPath: resolveRegisteredWorktreeRootPath,
	...sharedHostServiceOptions,
});

export { toFileSystemChangeEvent };
export type { FileSystemChangeEvent, WorkspaceFsPathError, WorkspaceFsWatchEvent };

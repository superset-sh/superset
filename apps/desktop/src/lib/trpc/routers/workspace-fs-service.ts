import path from "node:path";
import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import { TRPCError } from "@trpc/server";
import { shell } from "electron";
import { getWorkspace } from "./workspaces/utils/db-helpers";
import { execWithShellEnv } from "./workspaces/utils/shell-env";
import { getWorkspacePath } from "./workspaces/utils/worktree";

const filesystemWatcherManager = new FsWatcherManager();

const sharedHostServiceOptions = {
	trashItem: async (absolutePath: string) => {
		await shell.trashItem(absolutePath);
	},
	runRipgrep: async (
		args: string[],
		options: { cwd: string; maxBuffer: number },
	) => {
		const result = await execWithShellEnv("rg", args, {
			cwd: options.cwd,
			maxBuffer: options.maxBuffer,
			windowsHide: true,
		});
		return { stdout: result.stdout };
	},
};

export function resolveWorkspaceRootPath(workspaceId: string): string {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace not found: ${workspaceId}`,
			cause: { kind: "WORKSPACE_NOT_FOUND", workspaceId },
		});
	}

	const rootPath = getWorkspacePath(workspace);
	if (!rootPath) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Workspace path not found: ${workspaceId}`,
			cause: { kind: "WORKSPACE_NOT_FOUND", workspaceId },
		});
	}

	return rootPath;
}

const serviceCache = new Map<string, FsHostService>();

export function getServiceForRootPath(rootPath: string): FsHostService {
	let service = serviceCache.get(rootPath);
	if (!service) {
		service = createFsHostService({
			rootPath,
			watcherManager: filesystemWatcherManager,
			...sharedHostServiceOptions,
		});
		serviceCache.set(rootPath, service);
	}
	return service;
}

export function getServiceForWorkspace(workspaceId: string): FsHostService {
	return getServiceForRootPath(resolveWorkspaceRootPath(workspaceId));
}

export function toRegisteredWorktreeRelativePath(
	worktreePath: string,
	absolutePath: string,
): string {
	const normalizedWorktreePath = path.resolve(worktreePath);
	const normalizedAbsolutePath = path.resolve(absolutePath);
	const relativePath = path.relative(
		normalizedWorktreePath,
		normalizedAbsolutePath,
	);

	if (
		relativePath === "" ||
		relativePath === "." ||
		relativePath === ".." ||
		relativePath.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relativePath)
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Path is outside worktree: ${absolutePath}`,
			cause: { kind: "PATH_VALIDATION", code: "INVALID_TARGET" },
		});
	}

	return relativePath.replace(/\\/g, "/");
}

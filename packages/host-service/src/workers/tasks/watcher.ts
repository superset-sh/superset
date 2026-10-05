import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
	type FindNestedRepoRootsOptions,
	type FindNestedRepoRootsResult,
	findNestedRepoRoots,
} from "@superset/workspace-fs/watch-scan";
import { listGitIgnoredDirs } from "../../runtime/git/ignored-dirs.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export const nestedRepositoriesTask = defineWorkerTask<
	{
		rootPath: string;
		options: Omit<FindNestedRepoRootsOptions, "signal" | "now">;
	},
	FindNestedRepoRootsResult
>({
	type: "watcher/nested-repositories",
	handler: ({ rootPath, options }) => findNestedRepoRoots(rootPath, options),
});

export const ignoredDirectoriesTask = defineWorkerTask<
	{ rootPath: string },
	string[]
>({
	type: "watcher/ignored-directories",
	handler: ({ rootPath }) => listGitIgnoredDirs(rootPath),
});

export const gitDirectoryTask = defineWorkerTask<
	{ rootPath: string },
	string | null
>({
	type: "watcher/git-directory",
	handler: async ({ rootPath }) => {
		try {
			const { stdout } = await promisify(execFile)(
				"git",
				["rev-parse", "--git-dir"],
				{ cwd: rootPath, timeout: 3_000 },
			);
			return resolve(rootPath, stdout.trim());
		} catch {
			return null;
		}
	},
});

export const watcherTasks = [
	nestedRepositoriesTask,
	ignoredDirectoriesTask,
	gitDirectoryTask,
];

import type { findNestedRepoRoots } from "@superset/workspace-fs/watch-scan";
import { getHostWorkerPool } from "../../workers/host-worker-pool.ts";
import {
	gitDirectoryTask,
	ignoredDirectoriesTask,
	nestedRepositoriesTask,
} from "../../workers/tasks/watcher.ts";

function getScanRunner() {
	const runner = getHostWorkerPool().getRunner();
	if (!runner) throw new Error("Watcher scans require the host worker bundle");
	return runner;
}

export const scanNestedRepositories: typeof findNestedRepoRoots = (
	rootPath,
	{ signal, now: _now, ...options },
) =>
	getScanRunner().runTask(
		nestedRepositoriesTask.type,
		{ rootPath, options },
		{ signal },
	);

export async function scanGitIgnoredDirectories(
	rootPath: string,
	signal?: AbortSignal,
): Promise<string[]> {
	return getScanRunner().runTask(
		ignoredDirectoriesTask.type,
		{ rootPath },
		{ signal },
	);
}

export async function resolveGitDirectory(
	rootPath: string,
	signal: AbortSignal,
): Promise<string | null> {
	return getScanRunner().runTask(
		gitDirectoryTask.type,
		{ rootPath },
		{ signal },
	);
}

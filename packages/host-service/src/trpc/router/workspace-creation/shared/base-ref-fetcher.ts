import { createGitEnvResolver } from "../../../../runtime/git";
import type { HostServiceContext } from "../../../../types";
import { getHostWorkerPool } from "../../../../workers/host-worker-pool";
import { gitFetchBaseRefTask } from "../../../../workers/tasks/git";
import type { BaseRefFetcher } from "../utils/resolve-new-branch-start-point";

/** Base-ref fetch for workspace creation, executed in the worker pool so the
 * network fetch's spawn + stdout drain stay off the host-service event loop.
 * Concurrent creates on the same base coalesce into one fetch. */
export function createWorkerBaseRefFetcher(
	ctx: Pick<HostServiceContext, "credentials">,
	repoPath: string,
): BaseRefFetcher {
	return async (target) => {
		const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
		return getHostWorkerPool().run(
			gitFetchBaseRefTask,
			{ worktreePath: repoPath, target, gitEnv },
			{
				timeoutMs: 30_000,
				strategy: "coalesce",
				dedupeKey: `${repoPath}:base-ref:${target.remote}/${target.branch}`,
			},
		);
	};
}

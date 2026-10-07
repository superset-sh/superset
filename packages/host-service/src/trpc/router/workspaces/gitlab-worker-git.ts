import {
	getHostWorkerPool,
	type HostWorkerPool,
} from "../../../workers/host-worker-pool";
import {
	type GitStorageIdentity,
	gitGitlabRawTask,
	gitResolveRepositoryTask,
} from "../../../workers/tasks/git";
import type { GitEnvironmentCommandRunner } from "../workspace-creation/shared/types";
import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";

type GitlabWorkerPool = Pick<
	HostWorkerPool,
	"run" | "assertMutationScopeHealthy" | "acquireMutationScope"
>;

class GitlabWorkerGit implements GitEnvironmentCommandRunner {
	private gitEnv?: Record<string, string>;
	private tail: Promise<void> = Promise.resolve();
	constructor(
		readonly repoPath: string,
		readonly storage: GitStorageIdentity,
		private pool: GitlabWorkerPool,
		private signal?: AbortSignal,
	) {}
	env(env: Record<string, string>): this {
		this.gitEnv = { ...env };
		return this;
	}
	assertHealthy(): void {
		this.pool.assertMutationScopeHealthy(this.storage.commonDir);
	}
	acquireLease() {
		return this.pool.acquireMutationScope(this.storage.commonDir, this.signal);
	}
	raw(argv: string[]): Promise<string> {
		const input = {
			repoPath: this.repoPath,
			storage: { ...this.storage },
			argv: [...argv],
			...(this.gitEnv ? { gitEnv: { ...this.gitEnv } } : {}),
		};
		let commandIndex = 0;
		while (
			input.argv[commandIndex] === "-c" ||
			input.argv[commandIndex] === "-C"
		)
			commandIndex += 2;
		const timeoutMs = input.argv[commandIndex] === "fetch" ? 900_000 : 60_000;
		const result = this.tail.then(async () => {
			this.assertHealthy();
			return this.pool.run(gitGitlabRawTask, input, {
				timeoutMs,
				...(this.signal ? { signal: this.signal } : {}),
			});
		});
		this.tail = result.then(
			() => {},
			() => {},
		);
		return result;
	}
}

export async function createGitlabWorkerGit(
	repoPath: string,
	pool: GitlabWorkerPool = getHostWorkerPool(),
	signal?: AbortSignal,
) {
	const result = await pool.run(
		gitResolveRepositoryTask,
		{ repoPath, includeStorage: true },
		{ timeoutMs: 15_000, ...(signal ? { signal } : {}) },
	);
	if (
		!result.storage ||
		normalizeWorktreePath(result.repoPath) !== normalizeWorktreePath(repoPath)
	)
		throw new Error("Git checkout storage cannot be verified");
	pool.assertMutationScopeHealthy(result.storage.commonDir);
	return new GitlabWorkerGit(
		result.repoPath,
		{ ...result.storage },
		pool,
		signal,
	);
}

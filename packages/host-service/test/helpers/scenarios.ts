import { join } from "node:path";
import {
	createTestHost,
	type TestHost,
	type TestHostOptions,
} from "./createTestHost";
import { createGitFixture, type GitFixture } from "./git-fixture";
import { seedProject, seedWorkspace } from "./seed";

/**
 * Composable scenarios that bundle the host-service test harness with
 * a real git fixture and pre-seeded DB rows. Tests use these instead of
 * repeating the four-step `beforeEach` (host + repo + project + workspace)
 * across every file.
 *
 * Each scenario owns its `dispose()` — call it from `afterEach` to
 * clean up both the host and the on-disk repo in the right order.
 */

export interface BasicScenario {
	host: TestHost;
	repo: GitFixture;
	projectId: string;
	/** Workspace whose `worktreePath` points at the project root (i.e. the
	 *  "main" workspace by `workspace.delete`'s path-equality rule). */
	workspaceId: string;
	dispose(): Promise<void>;
}

export interface BasicScenarioOptions {
	/** Forwarded to `createTestHost` — pass `apiOverrides`, `chatRuntime`,
	 *  etc. Sensible defaults are used when omitted. */
	hostOptions?: TestHostOptions;
}

/**
 * The most common test setup: a host with one project rooted at a real
 * git repo, plus a workspace row pointing at the repo root.
 */
export async function createBasicScenario(
	options: BasicScenarioOptions = {},
): Promise<BasicScenario> {
	const host = await createTestHost(options.hostOptions);
	const repo = await createGitFixture();

	const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
	const { id: workspaceId } = seedWorkspace(host, {
		projectId,
		worktreePath: repo.repoPath,
		branch: "main",
	});

	return {
		host,
		repo,
		projectId,
		workspaceId,
		dispose: async () => {
			await host.dispose();
			repo.dispose();
		},
	};
}

export interface FeatureWorktreeScenario extends BasicScenario {
	/** Path to the feature worktree (under `<repoPath>/.worktrees/...`). */
	worktreePath: string;
	branch: string;
	/** Workspace id of the feature worktree (distinct from `workspaceId`,
	 *  which is the main workspace at the repo root). */
	featureWorkspaceId: string;
}

export interface FeatureWorktreeScenarioOptions extends BasicScenarioOptions {
	/** Defaults to "feature/cleanup". Used both as the git branch name and
	 *  (slugified) as the worktree directory under `.worktrees/`. */
	branch?: string;
}

/**
 * Basic scenario plus a real `git worktree add` for a feature branch and
 * a workspace row pointing at it. Used by workspace-cleanup, adopt, and
 * the workspace-create-delete tests.
 */
export async function createFeatureWorktreeScenario(
	options: FeatureWorktreeScenarioOptions = {},
): Promise<FeatureWorktreeScenario> {
	const basic = await createBasicScenario(options);
	const branch = options.branch ?? "feature/cleanup";
	const worktreePath = join(
		basic.repo.repoPath,
		".worktrees",
		branch.replace(/\//g, "-"),
	);
	await basic.repo.git.raw(["worktree", "add", "-b", branch, worktreePath]);

	const { id: featureWorkspaceId } = seedWorkspace(basic.host, {
		projectId: basic.projectId,
		worktreePath,
		branch,
	});

	return {
		...basic,
		worktreePath,
		branch,
		featureWorkspaceId,
	};
}

/**
 * `await using`-style helper: pass an async function and the scenario is
 * disposed when it returns or throws. Equivalent to `try/finally` with
 * the scenario lifecycle, useful for one-off tests outside `beforeEach`.
 */
export async function withBasicScenario<T>(
	options: BasicScenarioOptions,
	fn: (scenario: BasicScenario) => Promise<T>,
): Promise<T> {
	const scenario = await createBasicScenario(options);
	try {
		return await fn(scenario);
	} finally {
		await scenario.dispose();
	}
}

/** Convenience for tests that need just a project id and no workspace. */
export async function createProjectScenario(
	options: BasicScenarioOptions = {},
): Promise<{
	host: TestHost;
	repo: GitFixture;
	projectId: string;
	dispose(): Promise<void>;
}> {
	const host = await createTestHost(options.hostOptions);
	const repo = await createGitFixture();
	const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
	return {
		host,
		repo,
		projectId,
		dispose: async () => {
			await host.dispose();
			repo.dispose();
		},
	};
}

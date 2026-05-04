import { afterEach, describe, expect, test } from "bun:test";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostDb } from "../../src/db";
import { GitWatcher } from "../../src/events/git-watcher";
import { WorkspaceFilesystemManager } from "../../src/runtime/filesystem";
import { PullRequestRuntimeManager } from "../../src/runtime/pull-requests/pull-requests";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

/**
 * INTEGRATION coverage for the event-driven path of finding #1 in
 * `plans/v2-paths-worktree-perf-findings.md`.
 *
 * Wires a real `GitWatcher` into the runtime, lets the initial sweep settle,
 * then fires a single real `git commit` in one workspace. Asserts that ONLY
 * that workspace's sync runs — the other N-1 stay quiet. This is the
 * post-fix steady state: idle workspaces do zero git work.
 *
 * The safety-net sweep's per-workspace cost (linearity + always-walks-N) is
 * covered by the mock-based unit test in
 * `packages/host-service/test/pull-requests-scaling.test.ts`. Doing it here
 * with real simple-git would just multiply the cost without adding signal,
 * since the unit test already pins the shape.
 */

interface GitOpLog {
	worktreePath: string;
	method: "raw" | "revparse" | "remote";
	args: string[];
}

function instrumentGit(
	realGit: SimpleGit,
	log: GitOpLog[],
	worktreePath: string,
): SimpleGit {
	return new Proxy(realGit, {
		get(target, prop, receiver) {
			if (prop === "raw" || prop === "revparse" || prop === "remote") {
				return (args: string[]) => {
					log.push({
						worktreePath,
						method: prop as GitOpLog["method"],
						args: [...args],
					});
					// biome-ignore lint/suspicious/noExplicitAny: dispatching on a known SimpleGit method
					return (target as any)[prop](args);
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

interface EventDrivenScenario {
	host: TestHost;
	repos: GitFixture[];
	workspaceIds: string[];
	gitOpLog: GitOpLog[];
	manager: PullRequestRuntimeManager;
	gitWatcher: GitWatcher;
	filesystem: WorkspaceFilesystemManager;
	dispose: () => Promise<void>;
}

async function createEventDrivenScenario(
	workspaceCount: number,
): Promise<EventDrivenScenario> {
	const host = await createTestHost();
	const repos: GitFixture[] = [];
	const workspaceIds: string[] = [];

	for (let i = 0; i < workspaceCount; i++) {
		const repo = await createGitFixture();
		repos.push(repo);
		const { id: projectId } = seedProject(host, { repoPath: repo.repoPath });
		const headSha = (await repo.git.revparse(["HEAD"])).trim();
		const { id } = seedWorkspace(host, {
			projectId,
			worktreePath: repo.repoPath,
			branch: "main",
			headSha,
		});
		workspaceIds.push(id);
	}

	const gitOpLog: GitOpLog[] = [];
	const filesystem = new WorkspaceFilesystemManager({ db: host.db as HostDb });
	const gitWatcher = new GitWatcher(host.db as HostDb, filesystem);

	const manager = new PullRequestRuntimeManager({
		db: host.db as HostDb,
		git: async (worktreePath: string) =>
			instrumentGit(simpleGit(worktreePath), gitOpLog, worktreePath),
		github: async () => ({}) as never,
		gitWatcher,
	});

	(
		manager as unknown as { refreshProject: () => Promise<void> }
	).refreshProject = async () => undefined;

	const dispose = async () => {
		manager.stop();
		gitWatcher.close();
		await filesystem.close();
		for (const repo of repos) repo.dispose();
		await host.dispose();
	};

	return {
		host,
		repos,
		workspaceIds,
		gitOpLog,
		manager,
		gitWatcher,
		filesystem,
		dispose,
	};
}

async function waitFor(
	predicate: () => boolean,
	{ timeoutMs = 5000, pollMs = 50 } = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for predicate");
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
}

/**
 * Wait until `getValue()` stops growing for `quietMs` consecutive ms — i.e.
 * the system has settled. We need this when the initial sweep + concurrent
 * GitWatcher debounce flushes are still trickling in: a fixed-time sleep
 * after `start()` might snapshot mid-flush, leaving leftover ops to count
 * against later assertions.
 */
async function waitUntilQuiet(
	getValue: () => number,
	{ quietMs = 750, timeoutMs = 15_000, pollMs = 50 } = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastValue = getValue();
	let lastChangeAt = Date.now();
	while (Date.now() - lastChangeAt < quietMs) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for system to quiesce");
		}
		await new Promise((r) => setTimeout(r, pollMs));
		const current = getValue();
		if (current !== lastValue) {
			lastValue = current;
			lastChangeAt = Date.now();
		}
	}
}

describe("PullRequestRuntimeManager event-driven steady state", () => {
	let scenarios: EventDrivenScenario[] = [];

	afterEach(async () => {
		await Promise.all(scenarios.map((s) => s.dispose()));
		scenarios = [];
	});

	test("git:changed in one workspace triggers a single-workspace sync, not a full sweep", async () => {
		// 3 worktrees is enough to prove "only the target's worktree got ops" —
		// the other 2 must stay quiet. Larger N just multiplies setup cost.
		const scenario = await createEventDrivenScenario(3);
		scenarios.push(scenario);

		scenario.gitWatcher.start();
		scenario.manager.start();

		// Wait until the initial sweep AND any startup-related GitWatcher
		// events have fully drained — otherwise we'd snapshot mid-flush and
		// see leftover ops from another workspace counted as "event-driven".
		await waitFor(() => scenario.gitOpLog.length > 0, { timeoutMs: 10_000 });
		await waitUntilQuiet(() => scenario.gitOpLog.length, {
			quietMs: 1_000,
			timeoutMs: 15_000,
		});
		const baselineLogLength = scenario.gitOpLog.length;

		// Commit in one workspace only.
		const targetIndex = 1;
		const targetRepo = scenario.repos[targetIndex];
		if (!targetRepo) throw new Error("missing target repo");
		await targetRepo.commit("event-driven change", {
			"event.txt": "trigger",
		});

		// GitWatcher debounces 300 ms; wait for sync to fire and then settle.
		await waitFor(() => scenario.gitOpLog.length > baselineLogLength, {
			timeoutMs: 10_000,
		});
		await waitUntilQuiet(() => scenario.gitOpLog.length, {
			quietMs: 1_000,
			timeoutMs: 10_000,
		});

		const eventDrivenOps = scenario.gitOpLog.slice(baselineLogLength);
		const touchedWorktrees = new Set(
			eventDrivenOps.map((op) => op.worktreePath),
		);

		// Only the target workspace should have been synced.
		expect(touchedWorktrees.size).toBe(1);
		expect(touchedWorktrees.has(targetRepo.repoPath)).toBe(true);

		console.log(
			`[event-driven] commit in 1/${scenario.repos.length} workspaces → ${eventDrivenOps.length} git ops touching ${touchedWorktrees.size} worktree`,
		);
	}, 30_000);
});

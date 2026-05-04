import { afterEach, describe, test } from "bun:test";
import { eq } from "drizzle-orm";
import simpleGit, { type SimpleGit } from "simple-git";
import type { HostDb } from "../../src/db";
import { workspaces } from "../../src/db/schema";
import { GitWatcher } from "../../src/events/git-watcher";
import { WorkspaceFilesystemManager } from "../../src/runtime/filesystem";
import { PullRequestRuntimeManager } from "../../src/runtime/pull-requests/pull-requests";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

/**
 * BENCHMARK companion to `pull-requests-scaling.integration.test.ts`.
 *
 * Two measurements relevant after Fix #1 (event-driven branch sync):
 *
 * 1. **Event-to-DB-update latency** — wall-clock time from a real `git
 *    commit` until the workspaces.headSha row is updated. This is the new
 *    primary cost: paid only on real `.git/` activity, regardless of how
 *    many idle worktrees exist.
 *
 * 2. **Safety-net sweep cost** — wall-clock time for the long-cadence
 *    `syncWorkspaceBranches` call at N ∈ {1, 5, 20}. The sweep still does
 *    O(N) work *if it fires*, but now fires every 5 min instead of every
 *    30 s, so daily wall-clock waste drops by 10×.
 *
 * Output goes through `console.log`; assertions are minimal so the
 * benchmark doesn't fail on slow CI runners.
 */

interface OpCounter {
	count: number;
}

function instrumentGit(realGit: SimpleGit, counter: OpCounter): SimpleGit {
	return new Proxy(realGit, {
		get(target, prop, receiver) {
			if (prop === "raw" || prop === "revparse" || prop === "remote") {
				return (args: string[]) => {
					counter.count++;
					// biome-ignore lint/suspicious/noExplicitAny: dispatching on a known SimpleGit method
					return (target as any)[prop](args);
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});
}

interface BenchScenario {
	host: TestHost;
	repos: GitFixture[];
	workspaceIds: string[];
	manager: PullRequestRuntimeManager;
	gitWatcher: GitWatcher;
	filesystem: WorkspaceFilesystemManager;
	counter: OpCounter;
	dispose: () => Promise<void>;
}

async function setup(workspaceCount: number): Promise<BenchScenario> {
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

	const counter: OpCounter = { count: 0 };
	const filesystem = new WorkspaceFilesystemManager({ db: host.db as HostDb });
	const gitWatcher = new GitWatcher(host.db as HostDb, filesystem);
	const manager = new PullRequestRuntimeManager({
		db: host.db as HostDb,
		git: async (worktreePath: string) =>
			instrumentGit(simpleGit(worktreePath), counter),
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
		manager,
		gitWatcher,
		filesystem,
		counter,
		dispose,
	};
}

async function runSafetyNetTick(scenario: BenchScenario): Promise<void> {
	await (
		scenario.manager as unknown as {
			syncWorkspaceBranches: () => Promise<void>;
		}
	).syncWorkspaceBranches();
}

async function waitFor(
	predicate: () => boolean,
	{ timeoutMs = 10_000, pollMs = 25 } = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for predicate");
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
}

describe("BENCH: pull-requests runtime — post-fix steady state", () => {
	let scenarios: BenchScenario[] = [];

	afterEach(async () => {
		await Promise.all(scenarios.map((s) => s.dispose()));
		scenarios = [];
	});

	test("event-to-DB-update latency for a single git commit", async () => {
		const scenario = await setup(5);
		scenarios.push(scenario);

		scenario.gitWatcher.start();
		scenario.manager.start();

		// Wait for initial sweep to settle.
		await waitFor(() => scenario.counter.count >= 1, { timeoutMs: 10_000 });
		await new Promise((r) => setTimeout(r, 200));

		const targetWorkspaceId = scenario.workspaceIds[2];
		const targetRepo = scenario.repos[2];
		if (!targetWorkspaceId || !targetRepo) throw new Error("missing target");

		const expectedSha = (
			await targetRepo.commit("bench commit", { "bench.txt": "x" })
		).trim();

		const t0 = performance.now();
		await waitFor(
			() => {
				const row = scenario.host.db
					.select({ headSha: workspaces.headSha })
					.from(workspaces)
					.where(eq(workspaces.id, targetWorkspaceId))
					.get();
				return row?.headSha === expectedSha;
			},
			{ timeoutMs: 15_000, pollMs: 25 },
		);
		const latencyMs = performance.now() - t0;

		console.log("\n=== Event-to-DB-update latency ===");
		console.log(
			`commit → workspaces.headSha update: ${latencyMs.toFixed(0)}ms`,
		);
		console.log(
			"(includes 300ms GitWatcher debounce + git subprocesses + sqlite write)",
		);
		console.log("===\n");
	}, 60_000);

	test("safety-net sweep wall-clock for N ∈ {1, 5, 20}", async () => {
		const sizes = [1, 5, 20];
		const rows: Array<{
			n: number;
			warmupMs: number;
			measuredMs: number;
			ops: number;
			msPerOp: number;
		}> = [];

		for (const n of sizes) {
			const scenario = await setup(n);
			scenarios.push(scenario);

			// Warmup: first tick may pay JIT / disk-cache costs.
			const t0 = performance.now();
			await runSafetyNetTick(scenario);
			const warmupMs = performance.now() - t0;
			void warmupMs;

			// Measured: second tick is the steady-state sweep cost.
			scenario.counter.count = 0;
			const t1 = performance.now();
			await runSafetyNetTick(scenario);
			const measuredMs = performance.now() - t1;
			const ops = scenario.counter.count;

			rows.push({
				n,
				warmupMs: +warmupMs.toFixed(1),
				measuredMs: +measuredMs.toFixed(1),
				ops,
				msPerOp: +(measuredMs / ops).toFixed(2),
			});
		}

		console.log("\n=== Safety-net sweep wall-clock benchmark ===");
		console.log("N\twarmup ms\tsteady ms\tgit ops\tms/op\tprojected/5min tick");
		for (const r of rows) {
			console.log(
				`${r.n}\t${r.warmupMs}\t\t${r.measuredMs}\t\t${r.ops}\t${r.msPerOp}\t${r.measuredMs.toFixed(0)}ms / 5-min sweep`,
			);
		}

		const last = rows[rows.length - 1];
		if (last) {
			const msPerWorkspace = last.measuredMs / last.n;
			const dailyTicks = (24 * 60) / 5;
			console.log(
				`\nExtrapolation @ ${msPerWorkspace.toFixed(1)} ms/workspace/sweep:`,
			);
			for (const projN of [50, 100]) {
				const projectedMs = msPerWorkspace * projN;
				const projectedDailyMs = projectedMs * dailyTicks;
				console.log(
					`  N=${projN}: ~${projectedMs.toFixed(0)}ms/sweep × ${dailyTicks} sweeps/day = ~${(projectedDailyMs / 1000).toFixed(1)}s/day total sweep cost`,
				);
			}
		}
		console.log("===\n");
	}, 60_000);
});

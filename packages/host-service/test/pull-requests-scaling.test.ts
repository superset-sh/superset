import { describe, expect, mock, test } from "bun:test";
import { PullRequestRuntimeManager } from "../src/runtime/pull-requests/pull-requests";

/**
 * Pins the cost of the **safety-net sweep** that runs every
 * `SAFETY_NET_INTERVAL_MS` (5 min) — the long-cadence backup for the
 * event-driven `GitWatcher` subscription. When `syncWorkspaceBranches`
 * runs, it still walks every workspace and spawns ~5 git subprocesses
 * for each one. The fix from finding #1 doesn't change the safety-net
 * sweep's cost; it only ensures that path runs at 5 min instead of 30 s.
 *
 * The steady-state idle behavior — zero git ops when nothing changed in
 * any `.git/` directory — is covered by
 * `pull-requests-scaling.integration.test.ts`.
 */

interface RawCallLog {
	worktreePath: string;
	args: string[];
}

function buildWorkspace(index: number) {
	return {
		id: `ws-${index}`,
		projectId: `project-${index}`,
		worktreePath: `/tmp/worktree-${index}`,
		// Match what the git mock will return so syncWorkspaceBranches treats
		// every workspace as unchanged. This is the realistic steady-state:
		// nothing changed, but we still pay full git-subprocess cost per tick.
		branch: "main",
		headSha: "deadbeef",
		upstreamOwner: "acme",
		upstreamRepo: "repo",
		upstreamBranch: "main",
		pullRequestId: null,
		createdAt: Date.now(),
	};
}

function buildGitMock(rawCalls: RawCallLog[], worktreePath: string) {
	const recordingRaw = mock(async (args: string[]) => {
		rawCalls.push({ worktreePath, args });

		// symbolic-ref --short HEAD → branch name
		if (args[0] === "symbolic-ref") return "main\n";

		// rev-parse --abbrev-ref BRANCH@{push} → push ref
		if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
			return "origin/main\n";
		}

		// remote get-url <name>
		if (args[0] === "remote" && args[1] === "get-url") {
			return "https://github.com/acme/repo.git\n";
		}

		// config --get <key>
		if (args[0] === "config") {
			return "";
		}

		throw new Error(`Unexpected raw args: ${args.join(" ")}`);
	});

	return {
		raw: recordingRaw,
		revparse: mock(async (args: string[]) => {
			rawCalls.push({ worktreePath, args: ["revparse", ...args] });
			if (args[0] === "HEAD") return "deadbeef\n";
			throw new Error(`Unexpected revparse args: ${args.join(" ")}`);
		}),
		remote: mock(async (args: string[]) => {
			rawCalls.push({ worktreePath, args: ["remote", ...args] });
			if (args[0] === "get-url") return "https://github.com/acme/repo.git\n";
			throw new Error(`Unexpected remote args: ${args.join(" ")}`);
		}),
	};
}

async function runSync(workspaceCount: number) {
	const workspaces = Array.from({ length: workspaceCount }, (_, i) =>
		buildWorkspace(i),
	);

	const rawCalls: RawCallLog[] = [];

	const workspacesById = new Map(workspaces.map((w) => [w.id, w]));
	const db = {
		select: mock(() => ({
			from: mock(() => ({
				all: mock(() => workspaces),
			})),
		})),
		// syncWorkspaceBranches only writes when state changed; nothing should change here.
		update: mock(() => {
			throw new Error("update should not be called when state is unchanged");
		}),
	};

	const gitFactoryCalls: string[] = [];
	const git = mock(async (worktreePath: string) => {
		gitFactoryCalls.push(worktreePath);
		return buildGitMock(rawCalls, worktreePath);
	});

	const manager = new PullRequestRuntimeManager({
		db: db as never,
		git: git as never,
		github: async () => ({}) as never,
		gitWatcher: { onChanged: () => () => {} } as never,
	});

	// `syncWorkspaceBranches` calls `refreshProject` only for changed projects;
	// stub it to a no-op so the test focuses purely on per-workspace git cost.
	(
		manager as unknown as {
			refreshProject: () => Promise<void>;
		}
	).refreshProject = mock(async () => undefined);

	// The sweep now routes through enqueueWorkspaceSync → syncOneWorkspace,
	// which re-reads each workspace via `select().from().where().get()`.
	// Bypass the drizzle .where() chain (awkward to mock) by feeding rows
	// from our local map; syncWorkspaceRow still drives the real git work.
	(
		manager as unknown as {
			syncOneWorkspace: (id: string) => Promise<void>;
		}
	).syncOneWorkspace = async (id: string) => {
		const workspace = workspacesById.get(id);
		if (!workspace) return;
		await (
			manager as unknown as {
				syncWorkspaceRow: (
					w: ReturnType<typeof buildWorkspace>,
				) => Promise<string | null>;
			}
		).syncWorkspaceRow(workspace);
	};

	await (
		manager as unknown as { syncWorkspaceBranches: () => Promise<void> }
	).syncWorkspaceBranches();

	return { rawCalls, gitFactoryCalls };
}

describe("syncWorkspaceBranches safety-net sweep — worktree-scaling", () => {
	test("git subprocess count grows linearly with workspace count", async () => {
		const small = await runSync(2);
		const large = await runSync(20);

		// One git factory invocation per workspace per tick
		expect(small.gitFactoryCalls.length).toBe(2);
		expect(large.gitFactoryCalls.length).toBe(20);

		// Each workspace issues the same fixed number of git ops on an unchanged
		// repo (branch lookup + HEAD + push-ref + remote URL). The exact count
		// is implementation-defined; what we assert is *linearity*: the cost
		// for 20 workspaces is 10× the cost for 2.
		const perWorkspaceSmall = small.rawCalls.length / 2;
		const perWorkspaceLarge = large.rawCalls.length / 20;
		expect(perWorkspaceSmall).toBe(perWorkspaceLarge);

		// Per-workspace cost is non-trivial — at least a branch lookup, HEAD,
		// and push-ref resolution. If this drops below 3 the runtime probably
		// dropped some git work and this scaling concern is partially fixed.
		expect(perWorkspaceSmall).toBeGreaterThanOrEqual(3);

		// Print the actual per-tick cost so the test output documents the
		// scaling factor for future readers.
		console.log(
			`[scaling] per-tick git ops: 2 workspaces=${small.rawCalls.length}, 20 workspaces=${large.rawCalls.length}, per-workspace=${perWorkspaceSmall}`,
		);
	});

	test("safety-net sweep calls all N git factories even when zero workspaces changed", async () => {
		// The safety-net sweep still walks every workspace — that's its job.
		// What changed in finding #1 is the **cadence**: this used to fire every
		// 30s; now it fires every 5 min, and the steady-state per-workspace
		// sync runs only on real `.git/` activity.
		const { gitFactoryCalls, rawCalls } = await runSync(10);

		expect(gitFactoryCalls.length).toBe(10);
		expect(new Set(gitFactoryCalls).size).toBe(10);
		expect(rawCalls.length).toBeGreaterThanOrEqual(30); // ≥3 ops × 10 workspaces

		// Each workspace got its share of the work — no batching, no shortcut.
		const callsByWorktree = new Map<string, number>();
		for (const call of rawCalls) {
			callsByWorktree.set(
				call.worktreePath,
				(callsByWorktree.get(call.worktreePath) ?? 0) + 1,
			);
		}
		expect(callsByWorktree.size).toBe(10);
		for (const count of callsByWorktree.values()) {
			expect(count).toBeGreaterThanOrEqual(3);
		}
	});
});

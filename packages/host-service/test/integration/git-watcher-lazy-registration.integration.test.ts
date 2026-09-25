import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../src/db";
import { workspaces } from "../../src/db/schema";
import { GIT_DIR_DEBOUNCE_MS, GitWatcher } from "../../src/events/git-watcher";
import { WorkspaceFilesystemManager } from "../../src/runtime/filesystem";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";
import { seedProject, seedWorkspace } from "../helpers/seed";

/**
 * Regression coverage for the fix to GitHub issue #6729: `GitWatcher` used
 * to register a live watcher for every non-archived workspace regardless of
 * whether anything was interested in it. It's now refcounted via
 * `watchWorkspace`/`unwatchWorkspace`, driven by client `git:watch`
 * subscriptions — a workspace is watched exactly while its interest count is
 * positive.
 *
 * These tests run against a real `GitWatcher` wired to a real sqlite db and
 * real git repos (not a mock), same harness as the sibling
 * `pull-requests-scaling.integration.test.ts`.
 */

interface GitWatcherInternals {
	watched: Map<string, { watcher: unknown; worktreePath: string }>;
	interest: Map<string, number>;
	ignoredDirs: Map<string, { lastRefreshAt: number; rulesChanged: boolean }>;
	rescan(): Promise<void>;
}

function internals(watcher: GitWatcher): GitWatcherInternals {
	return watcher as unknown as GitWatcherInternals;
}

async function waitFor(
	predicate: () => boolean,
	{ timeoutMs = 5000, pollMs = 25 } = {},
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for predicate");
		}
		await new Promise((r) => setTimeout(r, pollMs));
	}
}

// GitWatcher's own DB check inside watchWorkspace/attachFromDb is async —
// give it a moment to settle before asserting a negative ("still not
// watched").
async function settle(ms = 300): Promise<void> {
	await new Promise((r) => setTimeout(r, ms));
}

interface Scenario {
	host: TestHost;
	repos: GitFixture[];
	workspaceIds: string[];
	gitWatcher: GitWatcher;
	filesystem: WorkspaceFilesystemManager;
	dispose: () => Promise<void>;
}

async function createScenario(workspaceCount: number): Promise<Scenario> {
	const host = await createTestHost();
	const repos: GitFixture[] = [];
	const workspaceIds: string[] = [];

	// Kept separate from `repos` (not pushed there) so `repos[i]` stays
	// aligned with `workspaceIds[i]` for tests that index into it — this one
	// only backs the project row, no workspace ever points at it.
	const projectRepo = await createGitFixture();
	const { id: projectId } = seedProject(host, {
		repoPath: projectRepo.repoPath,
	});

	for (let i = 0; i < workspaceCount; i++) {
		const repo = await createGitFixture();
		repos.push(repo);
		const headSha = (await repo.git.revparse(["HEAD"])).trim();
		const { id } = seedWorkspace(host, {
			projectId,
			worktreePath: repo.repoPath,
			branch: "main",
			headSha,
		});
		workspaceIds.push(id);
	}

	const filesystem = new WorkspaceFilesystemManager({ db: host.db as HostDb });
	const gitWatcher = new GitWatcher(host.db as HostDb, filesystem);

	const dispose = async () => {
		gitWatcher.close();
		await filesystem.close();
		for (const repo of repos) repo.dispose();
		projectRepo.dispose();
		await host.dispose();
	};

	return { host, repos, workspaceIds, gitWatcher, filesystem, dispose };
}

describe("GitWatcher lazy registration (regression coverage for #6729)", () => {
	let scenarios: Scenario[] = [];

	afterEach(async () => {
		await Promise.all(scenarios.map((s) => s.dispose()));
		scenarios = [];
	});

	test("start() watches nothing when nobody has expressed interest", async () => {
		const N = 6;
		const scenario = await createScenario(N);
		scenarios.push(scenario);

		scenario.gitWatcher.start();
		// Let the initial rescan (and its retry pass, which has nothing to
		// retry) run at least once.
		await settle();

		expect(internals(scenario.gitWatcher).watched.size).toBe(0);
	});

	test("watchWorkspace/unwatchWorkspace drives membership — not archival, not total workspace count", async () => {
		const N = 6;
		const scenario = await createScenario(N);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const interested = scenario.workspaceIds.slice(0, 3);
		const uninterested = scenario.workspaceIds.slice(3);

		for (const id of interested) scenario.gitWatcher.watchWorkspace(id);

		await waitFor(
			() => internals(scenario.gitWatcher).watched.size === interested.length,
			{ timeoutMs: 10_000 },
		);
		for (const id of interested) {
			expect(internals(scenario.gitWatcher).watched.has(id)).toBe(true);
		}
		for (const id of uninterested) {
			expect(internals(scenario.gitWatcher).watched.has(id)).toBe(false);
		}

		// Archiving an UNWATCHED workspace changes nothing about the watched
		// set — archival is no longer what gates membership.
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt: Date.now() })
			.where(eq(workspaces.id, uninterested[0] as string))
			.run();
		await internals(scenario.gitWatcher).rescan();
		expect(internals(scenario.gitWatcher).watched.size).toBe(interested.length);

		// Releasing interest tears the watcher down immediately, without
		// needing archival at all.
		const released = interested[0] as string;
		scenario.gitWatcher.unwatchWorkspace(released);
		expect(internals(scenario.gitWatcher).watched.has(released)).toBe(false);
		expect(internals(scenario.gitWatcher).watched.size).toBe(
			interested.length - 1,
		);
	});

	test("multiple watchWorkspace calls for the same workspace are refcounted — one unwatch doesn't tear it down", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		scenario.gitWatcher.watchWorkspace(id);
		scenario.gitWatcher.watchWorkspace(id);

		await waitFor(() => internals(scenario.gitWatcher).watched.has(id), {
			timeoutMs: 10_000,
		});

		scenario.gitWatcher.unwatchWorkspace(id);
		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(true);

		scenario.gitWatcher.unwatchWorkspace(id);
		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(false);
	});

	test("unwatchWorkspace before an in-flight attach resolves does not leak a watcher", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		// watchWorkspace kicks off an async DB lookup + `git rev-parse`
		// subprocess before it ever touches `watched`. Releasing interest in
		// the same tick — before either has a chance to resolve — must not
		// leave a watcher committed once they do.
		scenario.gitWatcher.watchWorkspace(id);
		scenario.gitWatcher.unwatchWorkspace(id);

		// Give the in-flight attach every chance to (wrongly) complete.
		await new Promise((r) => setTimeout(r, 1_500));

		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(false);
		expect(internals(scenario.gitWatcher).interest.has(id)).toBe(false);
	});

	test("watchWorkspace emits a catch-up git:changed once attached, even with no new activity", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		const events: string[] = [];
		scenario.gitWatcher.onChanged((event) => events.push(event.workspaceId));

		// No `.git/` or worktree activity happens here — attaching is the only
		// thing that occurs. watchWorkspace's DB lookup + `git rev-parse` are
		// async, so anything that changed in that window has no fs.watch
		// coverage; without a catch-up emit on successful attach, a consumer
		// that read stale state right before this call would never refresh.
		scenario.gitWatcher.watchWorkspace(id);

		await waitFor(() => events.includes(id), { timeoutMs: 5_000 });
	});

	test("archiving a workspace with a pending debounce timer does not later emit a stale git:changed", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		const repo = scenario.repos[0];
		if (!repo) throw new Error("missing repo");

		scenario.gitWatcher.watchWorkspace(id);
		await waitFor(() => internals(scenario.gitWatcher).watched.has(id), {
			timeoutMs: 10_000,
		});

		const events: string[] = [];
		scenario.gitWatcher.onChanged((event) => events.push(event.workspaceId));

		// An empty commit touches only `.git/`, so the pending batch sits in the
		// GIT_DIR_DEBOUNCE_MS (1s) window — a worktree write would join it and
		// shrink the window to DEBOUNCE_MS, racing the archive below.
		await repo.commit("pending-at-archive-time", {});

		// Archive it (and force the same cleanup a real 30s rescan would run)
		// well before that 1s debounce window elapses.
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt: Date.now() })
			.where(eq(workspaces.id, id))
			.run();
		await internals(scenario.gitWatcher).rescan();

		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(false);

		// Wait past the debounce window the pending batch was scheduled
		// under. A leaked timer would fire here and emit for `id`.
		await new Promise((r) => setTimeout(r, 1_500));

		expect(events).not.toContain(id);
	});

	test("interest survives a workspace transiently disappearing from a rescan — self-heals without a new watchGit", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;

		// A single watchWorkspace() call, same as one client sending one
		// git:watch — nothing calls it again for the rest of this test.
		scenario.gitWatcher.watchWorkspace(id);
		await waitFor(() => internals(scenario.gitWatcher).watched.has(id), {
			timeoutMs: 10_000,
		});

		// Simulate a transient disappearance (e.g. archive-then-restore via
		// the tombstone delete flow) spanning one rescan tick.
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt: Date.now() })
			.where(eq(workspaces.id, id))
			.run();
		await internals(scenario.gitWatcher).rescan();

		// The live watcher is torn down (real resource, correctly reclaimed)...
		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(false);
		// ...but interest — which nothing but watchWorkspace/unwatchWorkspace
		// should ever touch — must survive the gap.
		expect(internals(scenario.gitWatcher).interest.has(id)).toBe(true);

		// The workspace reappears (restored) before the next rescan tick.
		scenario.host.db
			.update(workspaces)
			.set({ archivedAt: null })
			.where(eq(workspaces.id, id))
			.run();
		await internals(scenario.gitWatcher).rescan();

		// Self-healed via the retry loop, with no second watchWorkspace() call.
		expect(internals(scenario.gitWatcher).watched.has(id)).toBe(true);
	});

	test("registration cost is paid only for workspaces someone actually watches, regardless of how many exist", async () => {
		const N = 30;
		const scenario = await createScenario(N);
		scenarios.push(scenario);
		scenario.gitWatcher.start();
		await settle();

		const idleStart = performance.now();
		await settle(200);
		const idleMs = performance.now() - idleStart;
		expect(internals(scenario.gitWatcher).watched.size).toBe(0);

		// Now actually ask for all of them, same as the old eager rescan used
		// to do unconditionally — this proves the mechanism still works when
		// requested, it just no longer happens for free.
		const watchStart = performance.now();
		for (const id of scenario.workspaceIds)
			scenario.gitWatcher.watchWorkspace(id);
		await waitFor(() => internals(scenario.gitWatcher).watched.size === N, {
			timeoutMs: 20_000,
		});
		const watchMs = performance.now() - watchStart;

		console.log(
			`[git-watcher validation] ${N} non-archived workspaces, 0 watched: ${idleMs.toFixed(0)}ms idle cost`,
		);
		console.log(
			`[git-watcher validation] ${N} non-archived workspaces, all ${N} explicitly watched: ${watchMs.toFixed(0)}ms`,
		);

		// Not a strict perf assertion (noisy CI/dev machines) — the point is
		// the real numbers above: idle cost stays flat regardless of N, and
		// the registration cost only shows up once something asks for it.
		expect(internals(scenario.gitWatcher).watched.size).toBe(N);
	}, 60_000);

	test("unwatching during an in-flight ignore refresh does not emit for the unwatched workspace", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		const repo = scenario.repos[0] as GitFixture;
		const events: string[] = [];
		scenario.gitWatcher.onChanged((event) => events.push(event.workspaceId));

		scenario.gitWatcher.watchWorkspace(id);
		// Drain the attach catch-up emit so the count below is exact.
		await waitFor(() => events.length === 1, { timeoutMs: 5_000 });

		// The ignore refresh that rides on an emit is rate-limited; the attach
		// just ran one, so age it out to make the next emit's refresh run.
		const ignoredState = internals(scenario.gitWatcher).ignoredDirs.get(id);
		if (!ignoredState)
			throw new Error("expected ignore state for a watched workspace");
		ignoredState.lastRefreshAt = 0;

		// Deterministic race: the refresh's slow half (re-deriving the native
		// watcher's ignore set) lands on the swap path exactly when interest is
		// released. Before the guard, the continuation scheduled a git:changed
		// for a workspace nothing watched any more.
		scenario.filesystem.refreshWatcherIgnores = async () => {
			scenario.gitWatcher.unwatchWorkspace(id);
			return true;
		};

		// `.git/info/exclude` is an ignore-rule source: editing it flags
		// rulesChanged and marks the workspace dirty, so the flush both emits
		// (legitimately — still watched at that instant) and starts the refresh.
		await mkdir(join(repo.repoPath, ".git", "info"), { recursive: true });
		await writeFile(
			join(repo.repoPath, ".git", "info", "exclude"),
			"# probe\n",
		);

		await waitFor(() => events.length === 2, { timeoutMs: 5_000 });
		await waitFor(() => !internals(scenario.gitWatcher).watched.has(id), {
			timeoutMs: 5_000,
		});

		// A stray emit would land one debounce window after the swap.
		await settle(GIT_DIR_DEBOUNCE_MS + 700);
		expect(events).toEqual([id, id]);
		expect(internals(scenario.gitWatcher).ignoredDirs.has(id)).toBe(false);
	});

	test("a stale error from a replaced .git watcher does not evict the live entry", async () => {
		const scenario = await createScenario(1);
		scenarios.push(scenario);
		scenario.gitWatcher.start();

		const id = scenario.workspaceIds[0] as string;
		const watchedEntry = () => internals(scenario.gitWatcher).watched.get(id);

		scenario.gitWatcher.watchWorkspace(id);
		await waitFor(() => watchedEntry() !== undefined, { timeoutMs: 10_000 });
		const stale = watchedEntry()?.watcher as {
			emit: (event: string, ...args: unknown[]) => boolean;
		};

		// Replace the watcher: unwatch tears the first one down, rewatch
		// attaches a fresh one for the same workspace id.
		scenario.gitWatcher.unwatchWorkspace(id);
		scenario.gitWatcher.watchWorkspace(id);
		await waitFor(() => watchedEntry() !== undefined, { timeoutMs: 10_000 });
		expect(watchedEntry()?.watcher).not.toBe(stale);

		// An error the old native watcher had queued lands now. Keyed only by
		// workspace id, its cleanup used to delete the new entry and strand a
		// live native watcher with nothing tracking it.
		stale.emit("error", new Error("stale watcher error"));

		expect(watchedEntry()).toBeDefined();
		expect(watchedEntry()?.watcher).not.toBe(stale);
	});
});

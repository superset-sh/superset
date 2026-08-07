import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";

/**
 * Walks the full commit window of git.listGraph and flattens every ref so
 * state/tag/head assertions don't depend on which commit a ref decorates.
 */
function allBranchStates(result: {
	commits: Array<{ refs: Array<{ type: string; state: string | null }> }>;
}) {
	const states = new Set<string>();
	for (const c of result.commits) {
		for (const r of c.refs) {
			if (r.type === "branch" && r.state) states.add(r.state);
		}
	}
	return states;
}

describe("git.listGraph", () => {
	let scenario: BasicScenario;
	/** Adjacent temp dir holding feature/stale worktrees so dispose() (which
	 * rms the repo) plus this cleanup leaves nothing behind. */
	let worktreeBase: string;

	beforeEach(async () => {
		scenario = await createBasicScenario();
		worktreeBase = mkdtempSync(join(tmpdir(), "host-service-graph-wt-"));
	});

	afterEach(async () => {
		await scenario?.dispose();
		rmSync(worktreeBase, { recursive: true, force: true });
	});

	test("returns empty window for a fresh repo with a single commit", async () => {
		const result = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
		});
		// HEAD + main + initial commit are reachable; the window has exactly
		// the one seeded commit, decorated with HEAD + the main branch.
		expect(result.commits.length).toBeGreaterThanOrEqual(1);
		expect(result.nextCursor).toBeNull();
	});

	test("classifies all local ref states and decorates tags/HEAD with parents populated", async () => {
		const { git } = scenario.repo;
		// Base ref so resolveBaseComparison + `git branch --merged` resolve.
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);

		// A branch merged into base via a no-ff merge commit (2 parents).
		await git.checkoutLocalBranch("merged-prev");
		await scenario.repo.commit("on merged-prev", { "mp.txt": "x" });
		await git.checkout("main");
		await git.raw([
			"merge",
			"--no-ff",
			"merged-prev",
			"-m",
			"merge merged-prev into main",
		]);
		// Advance base past the merge so merged-prev is contained in base.
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);

		// An orphan branch: a commit not reachable from base.
		await git.checkoutLocalBranch("orphan");
		await scenario.repo.commit("on orphan", { "orphan.txt": "o" });
		await git.checkout("main");

		// Recent commit on main so the window has content beyond the merge.
		const taggedSha = await scenario.repo.commit("recent on main", {
			"recent.txt": "1",
		});
		await git.raw(["tag", "v1.0", taggedSha]);

		// A worktree with NO workspaces row → detached-worktree.
		const featurePath = join(worktreeBase, "feature");
		await git.raw(["worktree", "add", "-b", "feature", featurePath]);

		// A worktree whose path is deleted from disk → prunable.
		const stalePath = join(worktreeBase, "stale");
		await git.raw(["worktree", "add", "-b", "stale", stalePath]);
		rmSync(stalePath, { recursive: true, force: true });

		const result = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 500,
		});

		// All five local-branch states are represented.
		const states = allBranchStates(result);
		expect(states.has("open")).toBe(true); // main (repo root, has a row)
		expect(states.has("detached-worktree")).toBe(true); // feature
		expect(states.has("orphan-branch")).toBe(true); // orphan
		expect(states.has("prunable")).toBe(true); // stale
		expect(states.has("merged")).toBe(true); // merged-prev

		// The merge commit carries two parents.
		const mergeCommit = result.commits.find(
			(c) => c.message === "merge merged-prev into main",
		);
		expect(mergeCommit).toBeDefined();
		expect(mergeCommit?.parents.length).toBe(2);

		// Tags and HEAD decorate commits.
		const allRefs = result.commits.flatMap((c) => c.refs);
		expect(allRefs.some((r) => r.type === "tag" && r.name === "v1.0")).toBe(
			true,
		);
		expect(allRefs.some((r) => r.type === "head" && r.name === "HEAD")).toBe(
			true,
		);

		// Remote-tracking decorations are not local-branch states.
		expect(
			result.commits.some((c) =>
				c.refs.some((r) => r.type === "remote" && r.state === null),
			),
		).toBe(true);

		// totalCommits is the full reachable set (independent of window).
		expect(result.totalCommits).toBe(result.commits.length);
		expect(result.nextCursor).toBeNull();
	});

	test("pagination via cursor windows the graph without losing totalCommits", async () => {
		const { git } = scenario.repo;
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);
		for (let i = 0; i < 5; i++) {
			await scenario.repo.commit(`commit ${i}`, { [`f${i}.txt`]: `${i}` });
		}

		const first = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 2,
		});
		expect(first.commits).toHaveLength(2);
		expect(first.nextCursor).toMatch(/^skip:2:local$/);
		// totalCommits reflects the full reachable history, not the window.
		expect(first.totalCommits).toBe(6); // initial + 5

		const second = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 2,
			cursor: first.nextCursor,
		});
		expect(second.commits[0]?.hash).not.toBe(first.commits[0]?.hash);
		expect(second.nextCursor).toMatch(/^skip:4:local$/);

		// A cursor issued for another scope is dropped, not replayed: page one
		// again rather than a window of rows that traversal never produced.
		const foreign = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 2,
			refScope: "head",
			cursor: first.nextCursor,
		});
		expect(foreign.commits[0]?.hash).toBe(first.commits[0]?.hash);
		expect(foreign.nextCursor).toMatch(/^skip:2:head$/);
	});

	test("topo order holds even when author dates are out of chronological order", async () => {
		const { git } = scenario.repo;
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);

		// `m2` is authored 2020. `m3` is m2's own child but BACKDATED to 2010,
		// older than its parent. `--date-order` (mutually exclusive with
		// `--topo-order`; git keeps only the last) would sort m3 below m2 —
		// parent before child — which is exactly the non-topological input
		// `assignLanes` cannot lay out. `--topo-order` alone keeps the child
		// above its parent regardless of timestamps.
		git.env({
			GIT_AUTHOR_DATE: "2020-02-02T12:00:00",
			GIT_COMMITTER_DATE: "2020-02-02T12:00:00",
		});
		await git.commit("m2", undefined, { "--allow-empty": null });
		git.env({
			GIT_AUTHOR_DATE: "2010-01-01T12:00:00",
			GIT_COMMITTER_DATE: "2010-01-01T12:00:00",
		});
		await git.commit("m3 (backdated)", undefined, { "--allow-empty": null });

		const result = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 500,
		});

		// Topological invariant: a parent present in the window always renders
		// below (older than) its child. `--date-order` would have broken this
		// for the backdated m3/m2 pair.
		const indexByHash = new Map(result.commits.map((c, i) => [c.hash, i]));
		for (const commit of result.commits) {
			const ci = indexByHash.get(commit.hash);
			if (ci === undefined) continue;
			for (const parent of commit.parents) {
				const pi = indexByHash.get(parent);
				if (pi === undefined) continue;
				expect(
					pi > ci,
					`parent ${parent.slice(0, 7)} of ${commit.hash.slice(
						0,
						7,
					)} must render after its child`,
				).toBe(true);
			}
		}

		// The backdated child sits above its parent — the exact case date-order
		// got wrong.
		const indexOf = (msg: string) =>
			result.commits.findIndex((c) => c.message === msg);
		expect(indexOf("m3 (backdated)")).toBeLessThan(indexOf("m2"));
		expect(indexOf("m2")).toBeLessThan(indexOf("initial commit"));
	});

	test("refScope narrows and widens the traversal", async () => {
		const { git } = scenario.repo;
		// A branch with no worktree, unreachable from HEAD.
		await git.checkoutLocalBranch("side");
		await scenario.repo.commit("on side", { "side.txt": "s" });
		await git.checkout("main");
		await scenario.repo.commit("on main", { "main.txt": "m" });

		// A worktree checked out on `side` whose directory is then deleted: git
		// still lists it (prunable), but it is not an open workspace, so
		// "open-workspaces" must not pick `side` up through it.
		const stalePath = join(worktreeBase, "stale");
		await git.raw(["worktree", "add", stalePath, "side"]);
		rmSync(stalePath, { recursive: true, force: true });

		const subjects = async (refScope: "head" | "open-workspaces" | "local") =>
			(
				await scenario.host.trpc.git.listGraph.query({
					workspaceId: scenario.workspaceId,
					refScope,
				})
			).commits.map((c) => c.message);

		// "side" has no worktree, so only the branch-wide scopes reach it.
		expect(await subjects("head")).not.toContain("on side");
		expect(await subjects("open-workspaces")).not.toContain("on side");
		expect(await subjects("local")).toContain("on side");

		// "remote" walks refs/remotes only. Nothing is pushed here, so the local
		// work is absent and only HEAD's own history remains.
		const remote = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			refScope: "remote",
		});
		expect(remote.commits.map((c) => c.message)).not.toContain("on side");
		await git.raw(["update-ref", "refs/remotes/origin/side", "side"]);
		const fetched = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			refScope: "remote",
		});
		expect(fetched.commits.map((c) => c.message)).toContain("on side");

		// "all" adds remotes and tags as tips; it must at least cover local.
		const all = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			refScope: "all",
		});
		expect(all.commits.map((c) => c.message)).toContain("on side");
	});

	test("merged classification survives a window that drops the merge commit", async () => {
		const { git } = scenario.repo;
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);
		await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"refs/remotes/origin/main",
		]);

		// merged-prev: merged into base, tip lands in the graph.
		await git.checkoutLocalBranch("merged-prev");
		await scenario.repo.commit("mp tip", { "mp.txt": "x" });
		await git.checkout("main");
		await git.raw(["merge", "--no-ff", "merged-prev", "-m", "merge mp"]);
		await git.raw([
			"update-ref",
			"refs/remotes/origin/main",
			"refs/heads/main",
		]);

		// Bury the merge under enough commits that a small window excludes it.
		for (let i = 0; i < 3; i++) {
			await scenario.repo.commit(`after merge ${i}`, { [`a${i}.txt`]: `${i}` });
		}

		// Full window: merged-prev tip is visible and classified "merged".
		const full = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 500,
		});
		const mpRef = full.commits
			.flatMap((c) => c.refs)
			.find((r) => r.name === "merged-prev");
		expect(mpRef?.state).toBe("merged");

		// `git branch --merged` is computed independent of the log window: a
		// paged query that shows fewer commits still reports the same total.
		const paged = await scenario.host.trpc.git.listGraph.query({
			workspaceId: scenario.workspaceId,
			limit: 2,
		});
		expect(paged.totalCommits).toBe(full.totalCommits);
	});
});

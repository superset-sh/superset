import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createFsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import simpleGit, { type SimpleGit } from "simple-git";
import { GitWatcher } from "../../../../../events/git-watcher";
import { type GitStatusSnapshot, getGitStatusSnapshot } from "../git-status";
import { getGitStatusPartial } from "../git-status-partial";
import { GitStatusStore } from "./git-status-store";

const WS = "ws-adv3";

async function initRepo(path: string): Promise<SimpleGit> {
	const git = simpleGit(path);
	await git.init();
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await git.raw(["config", "core.autocrlf", "false"]);
	await git.raw(["symbolic-ref", "HEAD", "refs/heads/main"]);
	return git;
}

async function fullWalk(
	git: SimpleGit,
	repo: string,
	baseBranch: string | null,
): Promise<GitStatusSnapshot> {
	const { snapshot } = await getGitStatusSnapshot({
		git,
		worktreePath: repo,
		baseBranch: baseBranch ?? undefined,
	});
	return snapshot;
}

function readStore(
	store: GitStatusStore,
	git: SimpleGit,
	repo: string,
	baseBranch: string | null,
): Promise<GitStatusSnapshot> {
	return store.read({
		workspaceId: WS,
		baseBranch,
		computeFull: () => fullWalk(git, repo, baseBranch),
		computePartial: (paths) =>
			getGitStatusPartial({ git, worktreePath: repo, paths }),
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("round 3: the real worktree watcher feeding the store", () => {
	let repo: string;
	let git: SimpleGit;
	let manager: FsWatcherManager | null = null;

	beforeEach(async () => {
		repo = await realpath(mkdtempSync(join(tmpdir(), "superset-store-adv3-")));
		git = await initRepo(repo);
	});

	afterEach(async () => {
		await manager?.close();
		manager = null;
		rmSync(repo, { recursive: true, force: true });
	});

	test("a tracked file under a statically-ignored dir name (build/, dist/, vendor/) edited alone reaches the store", async () => {
		await writeFile(join(repo, "README.md"), "hello\n");
		for (const dir of ["build", "dist", "vendor", "out", "target"]) {
			await mkdir(join(repo, dir), { recursive: true });
			await writeFile(join(repo, dir, "tracked.js"), "export const x = 1;\n");
		}
		await git.add(".");
		await git.commit("init");

		// Use the production watcher policy and real native events.
		const store = new GitStatusStore();
		manager = new FsWatcherManager({
			debounceMs: 50,
			useDefaultIgnores: false,
			listGitIgnoredDirs: async () => [],
		});
		const nativePaths: string[] = [];
		await manager.subscribe({ absolutePath: repo }, (batch) => {
			for (const event of batch.events) nativePaths.push(event.absolutePath);
		});
		const service = createFsHostService({
			rootPath: repo,
			watcherManager: manager,
		});
		const db = {
			select: () => ({
				from: () => ({
					where: () => ({ get: () => ({ worktreePath: repo }) }),
				}),
			}),
		};
		const filesystem = {
			getServiceForPrimaryWorktree: () => service,
			refreshWatcherIgnores: async () => false,
			isWatchAttachBackingOff: () => false,
		};
		let attached = false;
		const watcher = new GitWatcher(
			db as unknown as ConstructorParameters<typeof GitWatcher>[0],
			filesystem as unknown as ConstructorParameters<typeof GitWatcher>[1],
			(workspaceId, watched) => {
				if (watched) store.attach(workspaceId);
				else store.drop(workspaceId);
				attached = watched;
			},
		);
		const recorded: string[][] = [];
		watcher.onChanged((event) => {
			recorded.push(event.paths ?? ["<broad>"]);
			store.recordChange(event.workspaceId, event.paths);
		});
		try {
			watcher.watchWorkspace(WS);
			const attachDeadline = Date.now() + 8_000;
			while (!attached) {
				if (Date.now() > attachDeadline) throw new Error("never attached");
				await sleep(25);
			}
			// Let the attach-time catch-up emit.
			await sleep(1_500);

			// Warm the cache from a full walk, exactly like the first getStatus.
			const clean = await readStore(store, git, repo, null);
			expect(clean.unstaged).toEqual([]);
			recorded.length = 0;
			nativePaths.length = 0;

			// No sibling edit may be needed to reveal these tracked changes.
			for (const dir of ["build", "dist", "vendor", "out", "target"]) {
				await writeFile(join(repo, dir, "tracked.js"), "export const x = 2;\n");
			}

			const deadline = Date.now() + 8_000;
			while (
				recorded.length === 0 ||
				!nativePaths.includes(join(repo, "build/tracked.js"))
			) {
				if (Date.now() > deadline) {
					throw new Error(
						`no tracked build event: ${JSON.stringify(recorded)}`,
					);
				}
				await sleep(25);
			}
			// Give any straggling batch every chance to arrive.
			await sleep(750);

			const served = await readStore(store, git, repo, null);
			const fresh = await fullWalk(git, repo, null);

			// Native events must include the tracked build file.
			expect(nativePaths).toContain(join(repo, "build/tracked.js"));
			expect(served.unstaged.map((f) => f.path).sort()).toEqual(
				fresh.unstaged.map((f) => f.path).sort(),
			);
		} finally {
			watcher.close();
		}
	}, 30_000);
});

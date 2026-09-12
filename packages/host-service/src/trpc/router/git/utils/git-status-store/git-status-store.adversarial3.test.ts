import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import {
	mkdir,
	readdir,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createFsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import simpleGit, { type SimpleGit } from "simple-git";
import { GitWatcher } from "../../../../../events/git-watcher";
import type { ChangedFile } from "../../types";
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

function normalize(files: ChangedFile[]): ChangedFile[] {
	return [...files]
		.map((f) => ({ ...f }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

function summary(snapshot: GitStatusSnapshot) {
	return {
		unstaged: normalize(snapshot.unstaged),
		staged: normalize(snapshot.staged),
		againstBase: normalize(snapshot.againstBase),
		ignoredPaths: [...snapshot.ignoredPaths].sort(),
	};
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
			getServiceForWorkspace: () => service,
			refreshWatcherIgnores: async () => false,
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

/* ------------------------------------------------------------------------ */
/* Seeded fuzz: modelled watcher batches, real store, real git.             */
/* ------------------------------------------------------------------------ */

class Rng {
	private state: number;
	constructor(seed: number) {
		this.state = seed >>> 0;
	}
	next(): number {
		// mulberry32
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	int(n: number): number {
		return Math.floor(this.next() * n);
	}
	pick<T>(items: readonly T[]): T {
		const item = items[this.int(items.length)];
		if (item === undefined) throw new Error("pick from empty");
		return item;
	}
	chance(p: number): boolean {
		return this.next() < p;
	}
}

const FILE_NAMES = [
	"a.txt",
	"b.ts",
	"c.md",
	"[id].tsx",
	"café.txt",
	"x y.txt",
	"-dash.txt",
	"note.log",
	"data.bin",
];
const DIR_NAMES = ["src", "lib", "app", "docs", "gen", "tmp-dir", "[slug]"];

interface Tree {
	files: string[];
	dirs: string[];
}

async function listTree(root: string): Promise<Tree> {
	const files: string[] = [];
	const dirs: string[] = [];
	async function walk(rel: string) {
		const entries = await readdir(join(root, rel), { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === ".git") continue;
			const relPath = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				dirs.push(relPath);
				await walk(relPath);
			} else {
				files.push(relPath);
			}
		}
	}
	await walk("");
	return { files, dirs };
}

type Emit = string[] | undefined;

interface Step {
	op: string;
	emit: Emit;
}

// Random directory deletion can leave a dangling or cyclic symlink. A failed
// write changes nothing; keep exercising subsequent operations in that case.
async function tryWrite(
	path: string,
	content: string | Buffer,
): Promise<boolean> {
	try {
		await writeFile(path, content);
		return true;
	} catch (error) {
		if (
			["ENOENT", "ELOOP", "ENOTDIR"].includes(
				(error as NodeJS.ErrnoException).code ?? "",
			)
		)
			return false;
		throw error;
	}
}

async function randomMutation(
	rng: Rng,
	repo: string,
	git: SimpleGit,
	outside: string,
): Promise<Step> {
	const tree = await listTree(repo);
	const editable = tree.files.filter((f) => f !== ".gitignore");
	const roll = rng.int(100);

	const newPath = (): { path: string; created: string[] } => {
		const created: string[] = [];
		let dir = "";
		const depth = rng.int(3);
		for (let i = 0; i < depth; i++) {
			const candidate = dir
				? `${dir}/${rng.pick(DIR_NAMES)}`
				: rng.pick(DIR_NAMES);
			if (!tree.dirs.includes(candidate) && !created.includes(candidate)) {
				created.push(candidate);
			}
			dir = candidate;
		}
		if (rng.chance(0.5) && tree.dirs.length > 0) {
			dir = rng.pick(tree.dirs);
			created.length = 0;
		}
		const name = rng.pick(FILE_NAMES);
		return { path: dir ? `${dir}/${name}` : name, created };
	};

	const content = () =>
		Array.from({ length: rng.int(6) }, () => `line ${rng.int(1000)}`).join(
			"\n",
		) + (rng.chance(0.7) ? "\n" : "");

	if (roll < 22) {
		const { path, created } = newPath();
		await mkdir(join(repo, path, ".."), { recursive: true });
		const written = await tryWrite(
			join(repo, path),
			path.endsWith(".bin") ? Buffer.from([0x50, 0x4b, 0, 1, 2, 3]) : content(),
		);
		if (!written) return { op: `failed write ${path}`, emit: created };
		const real = await realpath(join(repo, path));
		const emit = [...created, path];
		if (real.startsWith(`${repo}/`)) emit.push(real.slice(repo.length + 1));
		return { op: `create ${path}`, emit };
	}
	if (roll < 40 && editable.length > 0) {
		const path = rng.pick(editable);
		if (!(await tryWrite(join(repo, path), content())))
			return { op: `failed write ${path}`, emit: [] };
		// A write through a symlink lands on the target; the kernel reports
		// the real path, so the modelled watcher must too.
		const real = await realpath(join(repo, path)).catch(() => null);
		const emit = [path];
		if (real?.startsWith(`${repo}/`)) emit.push(real.slice(repo.length + 1));
		return { op: `edit ${path}`, emit };
	}
	if (roll < 50 && editable.length > 0) {
		const path = rng.pick(editable);
		await rm(join(repo, path), { force: true });
		return { op: `delete ${path}`, emit: [path] };
	}
	if (roll < 60 && editable.length > 0) {
		const from = rng.pick(editable);
		const { path: to, created } = newPath();
		if (from === to) return { op: "noop", emit: [] };
		await mkdir(join(repo, to, ".."), { recursive: true });
		await rm(join(repo, to), { recursive: true, force: true });
		await rename(join(repo, from), join(repo, to));
		return { op: `rename ${from} -> ${to}`, emit: [from, ...created, to] };
	}
	if (roll < 65 && tree.dirs.length > 0) {
		const dir = rng.pick(tree.dirs);
		const children = [
			...tree.files.filter((f) => f.startsWith(`${dir}/`)),
			...tree.dirs.filter((d) => d.startsWith(`${dir}/`)),
		];
		await rm(join(repo, dir), { recursive: true, force: true });
		return {
			op: `rmdir ${dir}`,
			emit: rng.chance(0.5) ? [dir] : [dir, ...children],
		};
	}
	if (roll < 70 && tree.dirs.length > 0) {
		const from = rng.pick(tree.dirs);
		const to = `${rng.pick(DIR_NAMES)}-${rng.int(5)}`;
		if (tree.dirs.includes(to) || from === to) return { op: "noop", emit: [] };
		await rename(join(repo, from), join(repo, to));
		const children = tree.files.filter((f) => f.startsWith(`${from}/`));
		return {
			op: `mvdir ${from} -> ${to}`,
			emit: rng.chance(0.5)
				? [from, to]
				: [
						from,
						to,
						...children,
						...children.map((c) => `${to}${c.slice(from.length)}`),
					],
		};
	}
	if (roll < 74) {
		const { path } = newPath();
		await mkdir(join(repo, path, ".."), { recursive: true });
		await rm(join(repo, path), { force: true });
		const target = rng.chance(0.5)
			? outside
			: editable.length > 0
				? join(repo, rng.pick(editable))
				: outside;
		await symlink(target, join(repo, path));
		return { op: `symlink ${path} -> ${target}`, emit: [path] };
	}
	if (roll < 80) {
		if (rng.chance(0.5) || editable.length === 0) {
			await git.raw(["add", "-A"]).catch(() => {});
			return { op: "git add -A", emit: undefined };
		}
		const path = rng.pick(editable);
		await git.raw(["add", "--", `:(literal)${path}`]).catch(() => {});
		return { op: `git add ${path}`, emit: undefined };
	}
	if (roll < 84) {
		await git.raw(["reset", "-q"]).catch(() => {});
		return { op: "git reset", emit: undefined };
	}
	if (roll < 87 && editable.length > 0) {
		const path = rng.pick(editable);
		await git
			.raw(["rm", "-q", "--cached", "--", `:(literal)${path}`])
			.catch(() => {});
		return { op: `git rm --cached ${path}`, emit: undefined };
	}
	if (roll < 90 && editable.length > 0) {
		const from = rng.pick(editable);
		const to = `${rng.pick(DIR_NAMES)}-${rng.int(9)}.txt`;
		await git.raw(["mv", "-k", "--", from, to]).catch(() => {});
		return { op: `git mv ${from} ${to}`, emit: undefined };
	}
	if (roll < 93) {
		await git.raw(["add", "-A"]);
		await git
			.raw(["commit", "-q", "-m", `step ${rng.int(1e6)}`])
			.catch(() => {});
		return { op: "git commit", emit: undefined };
	}
	if (roll < 96) {
		const patterns = ["*.log", "gen/", "tmp-dir/", "*.bin", "docs/**"];
		const chosen = Array.from({ length: rng.int(3) }, () => rng.pick(patterns));
		await writeFile(join(repo, ".gitignore"), `${chosen.join("\n")}\n`);
		return { op: `gitignore ${chosen.join(",")}`, emit: undefined };
	}
	if (roll < 98) {
		const dir = `nested-${rng.int(3)}`;
		await mkdir(join(repo, dir), { recursive: true });
		execFileSync("git", ["init", "-q", dir], { cwd: repo });
		await writeFile(join(repo, dir, "README.md"), "nested\n");
		// A nested repo without a commit makes `git add --intent-to-add` fail
		// for the whole batch, which silently disables unstaged rename
		// detection in the full walk (pre-existing; not the store's doing).
		// Give it one so the fuzz exercises the store, not that quirk.
		execFileSync("git", ["-C", dir, "add", "-A"], { cwd: repo });
		execFileSync(
			"git",
			[
				"-C",
				dir,
				"-c",
				"user.email=t@e.com",
				"-c",
				"user.name=t",
				"-c",
				"commit.gpgsign=false",
				"commit",
				"--allow-empty",
				"-q",
				"-m",
				"nested",
			],
			{ cwd: repo },
		);
		return { op: `nested repo ${dir}`, emit: [dir, `${dir}/README.md`] };
	}
	if (editable.length > 0) {
		const path = rng.pick(editable);
		await git.raw(["add", "-N", "--", `:(literal)${path}`]).catch(() => {});
		return { op: `git add -N ${path}`, emit: undefined };
	}
	return { op: "noop", emit: [] };
}

async function runFuzz(seed: number, steps: number): Promise<void> {
	const repo = await realpath(
		mkdtempSync(join(tmpdir(), `superset-store-fuzz-${seed}-`)),
	);
	const outsideDir = mkdtempSync(join(tmpdir(), "superset-store-fuzz-out-"));
	const outside = join(outsideDir, "outside.txt");
	await writeFile(outside, "outside\nfile\n");
	const git = await initRepo(repo);
	await writeFile(join(repo, "README.md"), "hello\nworld\n");
	await mkdir(join(repo, "src"), { recursive: true });
	await writeFile(join(repo, "src", "a.txt"), "a\n");
	await writeFile(join(repo, "src", "b.ts"), "b\n");
	await writeFile(join(repo, ".gitignore"), "*.log\n");
	await git.add(".");
	await git.commit("init");
	// A local upstream so baseBranch "main" resolves to a real ref.
	await git.raw(["config", "branch.main.remote", "."]);
	await git.raw(["config", "branch.main.merge", "refs/heads/main"]);
	await git.raw(["checkout", "-q", "-b", "work"]);
	await writeFile(join(repo, "src", "c.md"), "c\n");
	await git.add(".");
	await git.commit("work commit");

	const rng = new Rng(seed);
	const store = new GitStatusStore();
	store.attach(WS);
	const log: string[] = [];

	try {
		for (let i = 0; i < steps; i++) {
			const step = await randomMutation(rng, repo, git, outside);
			log.push(`${i}: ${step.op} -> ${JSON.stringify(step.emit)}`);
			if (step.emit === undefined) {
				store.recordChange(WS, undefined);
			} else if (step.emit.length > 0) {
				store.recordChange(WS, step.emit);
			}
			if (rng.chance(0.3)) continue;

			const variants: Array<string | null> = rng.chance(0.5)
				? [null, "main"]
				: [rng.pick([null, "main"])];
			const reads = variants.map((v) => readStore(store, git, repo, v));
			if (rng.chance(0.15)) store.recordChange(WS, undefined);
			const served = await Promise.all(reads);
			for (const [k, variant] of variants.entries()) {
				const snapshot = served[k];
				if (!snapshot) throw new Error("missing read result");
				const fresh = await fullWalk(git, repo, variant);
				const got = summary(snapshot);
				const want = summary(fresh);
				try {
					expect(got).toEqual(want);
				} catch (error) {
					console.log(
						`seed ${seed} diverged at step ${i} (variant ${JSON.stringify(variant)})\n${log.join("\n")}\nGOT ${JSON.stringify(got.unstaged.map((f) => `${f.status}:${f.path}`))}\nWANT ${JSON.stringify(want.unstaged.map((f) => `${f.status}:${f.path}`))}`,
					);
					throw error;
				}
			}
			// A second read with nothing pending must be served from cache and
			// still match — the cached object is what the next patch builds on.
			for (const [k, variant] of variants.entries()) {
				const again = await readStore(store, git, repo, variant);
				const before = served[k];
				if (!before) throw new Error("missing read result");
				expect(summary(again)).toEqual(summary(before));
			}
		}
	} finally {
		rmSync(repo, { recursive: true, force: true });
		rmSync(outsideDir, { recursive: true, force: true });
	}
}

describe("round 3: seeded fuzz against a fresh full walk", () => {
	for (const seed of [1, 2, 3, 4, 5, 6]) {
		test(`seed ${seed}: 120 mixed steps, both base-branch variants`, async () => {
			await runFuzz(seed, 120);
		}, 240_000);
	}
});

import { afterAll, beforeAll, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	findLinkedWorktrees,
	type WorktreeIndexEntry,
} from "./symlink-scanner";

let tmp: string;
let consumer: string; // the worktree we scan
let libA: string; // a tracked target
let libB: string; // an untracked-but-git target
let plainDir: string; // an external (non-git) target

beforeAll(async () => {
	tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lw-scanner-"));
	consumer = path.join(tmp, "consumer");
	libA = path.join(tmp, "lib-a");
	libB = path.join(tmp, "lib-b");
	plainDir = path.join(tmp, "plain");
	for (const d of [libA, libB, plainDir])
		await fs.mkdir(d, { recursive: true });

	// consumer/client/node_modules/{shared-a -> libA, @scope/pkg -> libB}
	const nm = path.join(consumer, "client", "node_modules");
	await fs.mkdir(path.join(nm, "@scope"), { recursive: true });
	await fs.symlink(libA, path.join(nm, "shared-a"));
	await fs.symlink(libB, path.join(nm, "@scope", "pkg"));
	// consumer/server/vendor/acme/ext -> plainDir (composer-style)
	const vendor = path.join(consumer, "server", "vendor", "acme");
	await fs.mkdir(vendor, { recursive: true });
	await fs.symlink(plainDir, path.join(vendor, "ext"));
	// a real (non-symlink) dep that must be ignored
	await fs.mkdir(path.join(nm, "left-pad"), { recursive: true });
});

afterAll(async () => {
	await fs.rm(tmp, { recursive: true, force: true });
});

const index = (): WorktreeIndexEntry[] => [
	{ path: libA, label: "feature-a", workspaceId: "ws-a", projectId: "proj-a" },
	// libB intentionally NOT in the index -> exercises resolveBranch (untracked)
];

test("finds tracked, untracked and external links; ignores real dirs", async () => {
	const resolveBranch = async (dir: string) =>
		dir === libB ? "branch-b" : null; // libB is git, plainDir is not
	const out = await findLinkedWorktrees(consumer, index(), { resolveBranch });

	const byPkg = Object.fromEntries(out.map((l) => [l.packageName, l]));
	expect(out).toHaveLength(3);

	expect(byPkg["shared-a"]).toMatchObject({
		kind: "tracked",
		label: "feature-a",
		targetWorkspaceId: "ws-a",
		targetProjectId: "proj-a",
		ecosystem: "npm",
		sourceDir: path.join("client", "node_modules"),
	});
	expect(byPkg["@scope/pkg"]).toMatchObject({
		kind: "untracked",
		label: "branch-b",
		ecosystem: "npm",
	});
	expect(byPkg.ext).toMatchObject({
		kind: "external",
		label: "plain",
		ecosystem: "composer",
		sourceDir: path.join("server", "vendor", "acme"),
	});
	expect(byPkg["left-pad"]).toBeUndefined();
});

test("ignores symlinks that resolve back inside the scanned worktree", async () => {
	// Bun/pnpm hoist workspace + store packages as symlinks pointing back into
	// the same repo (e.g. node_modules/turbo -> node_modules/.bun/turbo@x/...).
	// These are install artifacts, not links to OTHER worktrees, so they must
	// never be reported — even though resolveBranch would succeed on them.
	const selfTarget = path.join(consumer, "packages", "ui");
	await fs.mkdir(selfTarget, { recursive: true });
	const nm = path.join(consumer, "client", "node_modules");
	await fs.symlink(selfTarget, path.join(nm, "self-link"));

	// resolveBranch returns a branch for ANY git dir, mirroring the real impl
	// running `git rev-parse` inside the current worktree.
	const out = await findLinkedWorktrees(consumer, index(), {
		resolveBranch: async () => "quick-open-workspace",
	});

	expect(out.some((l) => l.packageName === "self-link")).toBe(false);

	await fs.rm(path.join(nm, "self-link"), { force: true });
	await fs.rm(selfTarget, { recursive: true, force: true });
});

test("does not descend INTO node_modules (nested node_modules ignored)", async () => {
	const nested = path.join(consumer, "client", "node_modules", "shared-a-real");
	await fs.mkdir(path.join(nested, "node_modules", "deep"), {
		recursive: true,
	});
	await fs
		.symlink(libA, path.join(nested, "node_modules", "deep", "x"))
		.catch(() => {});
	const out = await findLinkedWorktrees(consumer, index(), {});
	// the deep symlink under a nested node_modules must NOT appear
	expect(out.some((l) => l.packageName === "x")).toBe(false);
});

test("respects maxDepth", async () => {
	const out = await findLinkedWorktrees(consumer, index(), { maxDepth: 0 });
	expect(out).toHaveLength(0); // node_modules is below depth 0
});

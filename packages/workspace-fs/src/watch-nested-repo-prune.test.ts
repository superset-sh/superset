import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";

const tempRoots: string[] = [];
const managers: FsWatcherManager[] = [];

afterEach(async () => {
	await Promise.all(managers.splice(0).map((m) => m.close()));
	await Promise.all(
		tempRoots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-nested-"));
	const real = await fs.realpath(tempPath);
	tempRoots.push(real);
	return real;
}

async function waitFor(
	seen: string[],
	needle: string,
	timeoutMs = 8_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!seen.includes(needle)) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out waiting for ${needle}\nseen: ${seen.join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("FsWatcherManager nested-repo pruning", () => {
	it("does not emit events for files inside a nested git worktree", async () => {
		const rootPath = await createTempRoot();
		// A nested git worktree present at subscribe time — the shape of a
		// piled-up agent worktree. Deliberately NOT under `.claude/worktrees/` so
		// this exercises the generic nested-repo prune, not the static glob.
		const nested = path.join(rootPath, "vendor-checkout", "abc");
		await fs.mkdir(nested, { recursive: true });
		await fs.writeFile(path.join(nested, ".git"), "gitdir: /elsewhere\n");

		const manager = new FsWatcherManager({ debounceMs: 50 });
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		// A write inside the nested worktree must never surface...
		await fs.writeFile(path.join(nested, "should-be-ignored.ts"), "x");
		// ...while a write at the root must, proving the watcher is live and it's
		// the prune (not a dead stream) that suppressed the nested event.
		const rootFile = path.join(rootPath, "tracked.ts");
		await fs.writeFile(rootFile, "x");

		await waitFor(seen, `create:${rootFile}`);
		expect(seen).not.toContain(
			`create:${path.join(nested, "should-be-ignored.ts")}`,
		);
	}, 20_000);

	it("prunes a nested repo whose path contains glob magic (e.g. `[id]`)", async () => {
		const rootPath = await createTempRoot();
		// A nested repo under a Next.js-style dynamic route segment. Passing this
		// path to parcel bare would trip `is-glob` and mis-prune; the escaped-glob
		// form must still match its subtree.
		const nested = path.join(rootPath, "app", "[id]", "vendored");
		await fs.mkdir(nested, { recursive: true });
		await fs.writeFile(path.join(nested, ".git"), "gitdir: /elsewhere\n");

		const manager = new FsWatcherManager({ debounceMs: 50 });
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});

		await fs.writeFile(path.join(nested, "should-be-ignored.ts"), "x");
		// A sibling under `app/` (not the nested repo) must still surface — proves
		// the escaped glob doesn't over-match the bracket segment.
		const siblingFile = path.join(rootPath, "app", "other.ts");
		await fs.writeFile(siblingFile, "x");

		await waitFor(seen, `create:${siblingFile}`);
		expect(seen).not.toContain(
			`create:${path.join(nested, "should-be-ignored.ts")}`,
		);
	}, 20_000);
});

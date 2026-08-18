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
			.map((rootPath) => fs.rm(rootPath, { recursive: true, force: true })),
	);
});

async function createTempRoot(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-ignore-"));
	return fs.realpath(tempPath);
}

async function waitForCondition(
	check: () => boolean,
	timeoutMs = 4000,
	pollMs = 50,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!check()) {
		if (Date.now() > deadline) {
			throw new Error("Timed out waiting for watcher condition");
		}
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
}

describe("FsWatcherManager ignore patterns", () => {
	it("custom ignore patterns extend the defaults instead of replacing them", async () => {
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);
		await fs.mkdir(path.join(rootPath, "node_modules/pkg"), {
			recursive: true,
		});
		await fs.mkdir(path.join(rootPath, "custom"), { recursive: true });
		await fs.mkdir(path.join(rootPath, "src"), { recursive: true });

		const manager = new FsWatcherManager({
			debounceMs: 50,
			ignore: ["**/custom/**"],
		});
		managers.push(manager);

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) seen.push(event.absolutePath);
		});

		await fs.writeFile(path.join(rootPath, "node_modules/pkg/dep.js"), "x");
		await fs.writeFile(path.join(rootPath, "custom/skip.ts"), "x");
		await fs.writeFile(path.join(rootPath, "src/app.ts"), "x");

		await waitForCondition(() =>
			seen.includes(path.join(rootPath, "src/app.ts")),
		);
		// Ordered-delivery barrier: a later write arriving proves the earlier
		// ignored writes had their chance to arrive — no timing dependence.
		await fs.writeFile(path.join(rootPath, "src/barrier.ts"), "x");
		await waitForCondition(() =>
			seen.includes(path.join(rootPath, "src/barrier.ts")),
		);

		// Directory-touch events for the root/src dirs are fine; the two
		// ignored writes must not appear.
		expect(seen).toContain(path.join(rootPath, "src/app.ts"));
		expect(seen).not.toContain(path.join(rootPath, "node_modules/pkg/dep.js"));
		expect(seen).not.toContain(path.join(rootPath, "custom/skip.ts"));
	});
});

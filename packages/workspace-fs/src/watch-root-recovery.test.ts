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
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-recovery-"));
	return fs.realpath(tempPath);
}

async function waitFor(
	seen: string[],
	needle: string,
	label: string,
	timeoutMs = 8_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!seen.includes(needle)) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out waiting for ${label}\nseen: ${seen.join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("FsWatcherManager root deletion recovery", () => {
	it("does not hang teardown after root deletion, and a fresh subscribe works", async () => {
		const rootPath = await createTempRoot();
		tempRoots.push(rootPath);

		const manager = new FsWatcherManager({
			debounceMs: 50,
			recoveryPollMs: 100,
		});
		managers.push(manager);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await fs.rm(rootPath, { recursive: true, force: true });
		await new Promise((resolve) => setTimeout(resolve, 400));
		// Must not hang on the dead native stream.
		await unsubscribe();

		await fs.mkdir(rootPath, { recursive: true });
		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) {
				seen.push(`${event.kind}:${event.absolutePath}`);
			}
		});
		await fs.writeFile(path.join(rootPath, "fresh.ts"), "x");
		await waitFor(
			seen,
			`create:${path.join(rootPath, "fresh.ts")}`,
			"fresh.ts create on fresh subscription",
		);
		expect(seen).toContain(`create:${path.join(rootPath, "fresh.ts")}`);
	}, 20_000);
});

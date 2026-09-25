import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FsWatchEvent } from "./types";
import { FsWatcherManager } from "./watch";

/**
 * INTEGRATION: what the watcher reports for a path whose type it could not
 * measure.
 *
 * `normalizeEvent` stats every non-delete event to decide `isDirectory`, and
 * that stat runs a debounce window after @parcel/watcher classified the
 * event. These tests reproduce the losing side of that race deterministically:
 * a symlink to a target outside the watch root, whose target is removed after
 * parcel has reported the create but before the batch flushes. Parcel saw a
 * path; our stat sees ENOENT. The target lives outside the root so removing
 * it doesn't add an event of its own.
 */

interface WatcherStateView {
	directoryPaths: Set<string>;
}

interface FsWatcherManagerInternal {
	watchers: Map<string, WatcherStateView>;
}

// Long enough that the symlink's create event is still sitting in
// `pendingEvents` when the test removes the link target.
const RACE_DEBOUNCE_MS = 800;

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

async function createTempDir(): Promise<string> {
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-unknown-"));
	tempRoots.push(tempPath);
	// macOS puts the temp dir behind /var → /private/var; resolve it so the
	// paths we compare against match the ones the watcher emits.
	return fs.realpath(tempPath);
}

async function watchRoot(
	rootPath: string,
	debounceMs: number,
): Promise<{ manager: FsWatcherManager; events: FsWatchEvent[] }> {
	const manager = new FsWatcherManager({ debounceMs });
	managers.push(manager);
	const events: FsWatchEvent[] = [];
	await manager.subscribe({ absolutePath: rootPath }, (batch) => {
		events.push(...batch.events);
	});
	// FSEvents can be deaf for a moment after subscribe() resolves, and it
	// delivers a spurious create for the root itself — let that batch drain.
	await new Promise((resolve) => setTimeout(resolve, debounceMs + 400));
	return { manager, events };
}

async function waitForEvent(
	events: FsWatchEvent[],
	absolutePath: string,
	timeoutMs = 8_000,
): Promise<FsWatchEvent> {
	const match = () =>
		events.find(
			(event) => event.absolutePath === absolutePath && event.kind !== "delete",
		);
	const deadline = Date.now() + timeoutMs;
	let found = match();
	while (!found) {
		if (Date.now() > deadline) {
			throw new Error(
				`Timed out waiting for ${absolutePath}\nseen: ${events
					.map((event) => `${event.kind}:${event.absolutePath}`)
					.join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
		found = match();
	}
	return found;
}

/**
 * Creates `<root>/<name>` as a symlink parcel reports while it still resolves,
 * then breaks it so the watcher's own stat fails when the batch flushes.
 */
async function createPathThatVanishesBeforeFlush(
	rootPath: string,
	name: string,
): Promise<string> {
	const targetDir = await createTempDir();
	const targetPath = path.join(targetDir, "target");
	await fs.writeFile(targetPath, "x");

	const linkPath = path.join(rootPath, name);
	await fs.symlink(targetPath, linkPath);
	// Let parcel classify and deliver the create while the link still resolves.
	await new Promise((resolve) => setTimeout(resolve, 400));
	await fs.rm(targetPath);
	return linkPath;
}

describe("FsWatcherManager event typing", () => {
	it("reports a real file as a file", async () => {
		const rootPath = await createTempDir();
		const { events } = await watchRoot(rootPath, 50);

		const filePath = path.join(rootPath, "real.ts");
		await fs.writeFile(filePath, "x");

		const event = await waitForEvent(events, filePath);
		expect(event.isDirectory).toEqual(false);
	}, 20_000);

	it("reports a real directory as a directory", async () => {
		const rootPath = await createTempDir();
		const { events } = await watchRoot(rootPath, 50);

		const dirPath = path.join(rootPath, "real-dir");
		await fs.mkdir(dirPath);

		const event = await waitForEvent(events, dirPath);
		expect(event.isDirectory).toEqual(true);
	}, 20_000);

	it("reports no type for a path it could not stat", async () => {
		const rootPath = await createTempDir();
		const { events } = await watchRoot(rootPath, RACE_DEBOUNCE_MS);

		const linkPath = await createPathThatVanishesBeforeFlush(
			rootPath,
			"unmeasurable",
		);

		const event = await waitForEvent(events, linkPath);
		// Not `false`. The watcher has never seen this path, so "file" is a
		// guess, and consumers read `false` as a positive assertion: a
		// directory that lands in the Files tab as a file node can't be
		// expanded and poisons every lookup beneath it (DESKTOP-11E).
		expect(event.isDirectory).toBeUndefined();
	}, 20_000);

	it("keeps a remembered directory type when the stat fails", async () => {
		const rootPath = await createTempDir();
		const { manager, events } = await watchRoot(rootPath, RACE_DEBOUNCE_MS);

		const linkPath = path.join(rootPath, "remembered");
		const internal = manager as unknown as FsWatcherManagerInternal;
		const state = internal.watchers.get(rootPath);
		if (!state) throw new Error(`No WatcherState for ${rootPath}`);
		state.directoryPaths.add(linkPath);

		await createPathThatVanishesBeforeFlush(rootPath, "remembered");

		const event = await waitForEvent(events, linkPath);
		expect(event.isDirectory).toEqual(true);
	}, 20_000);
});

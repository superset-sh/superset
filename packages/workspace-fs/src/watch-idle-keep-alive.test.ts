import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager, type FsWatcherManagerOptions } from "./watch";
import type { NativeWatchBackend, NativeWatchRequest } from "./watch-backend";

interface FakeSubscription {
	rootPath: string;
	request: NativeWatchRequest;
	disposed: boolean;
}

function createFakeBackend() {
	const subscriptions: FakeSubscription[] = [];
	let unsubscribeGate: Promise<void> = Promise.resolve();
	const backend: NativeWatchBackend = {
		name: "fake",
		async subscribe(request) {
			const subscription: FakeSubscription = {
				rootPath: request.rootPath,
				request,
				disposed: false,
			};
			subscriptions.push(subscription);
			return {
				async unsubscribe() {
					await unsubscribeGate;
					subscription.disposed = true;
				},
			};
		},
	};
	return {
		backend,
		subscriptions,
		live: (rootPath: string) =>
			subscriptions.filter((s) => s.rootPath === rootPath && !s.disposed),
		holdUnsubscribes() {
			let release: () => void = () => {};
			unsubscribeGate = new Promise<void>((resolve) => {
				release = resolve;
			});
			return release;
		},
	};
}

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
	const tempPath = await fs.mkdtemp(path.join(os.tmpdir(), "watch-idle-"));
	const rootPath = await fs.realpath(tempPath);
	tempRoots.push(rootPath);
	return rootPath;
}

function createManager(
	backend: NativeWatchBackend,
	options: FsWatcherManagerOptions = {},
): FsWatcherManager {
	const manager = new FsWatcherManager({
		debounceMs: 10,
		backend,
		idleKeepAliveMs: 100,
		...options,
	});
	managers.push(manager);
	return manager;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(condition: () => boolean, label: string) {
	const deadline = Date.now() + 2_000;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for ${label}`);
		}
		await sleep(10);
	}
}

describe("FsWatcherManager idle keep-alive", () => {
	it("reuses the warm native subscription when re-subscribed within the grace period", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();

		const seen: string[] = [];
		await manager.subscribe({ absolutePath: rootPath }, (batch) => {
			for (const event of batch.events) seen.push(event.absolutePath);
		});

		expect(fake.subscriptions).toHaveLength(1);
		expect(fake.live(rootPath)).toHaveLength(1);

		const filePath = path.join(rootPath, "a.ts");
		fake.subscriptions[0]?.request.onEvents([
			{ type: "create", path: filePath },
		]);
		await waitUntil(() => seen.includes(filePath), "event on warm watcher");
	});

	it("disposes the idle watcher once the grace period elapses", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		expect(fake.live(rootPath)).toHaveLength(1);

		await waitUntil(() => fake.live(rootPath).length === 0, "idle expiry");

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("does not expire a watcher that was re-subscribed during its grace period", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		await manager.subscribe({ absolutePath: rootPath }, () => {});

		await sleep(250);
		expect(fake.subscriptions).toHaveLength(1);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("evicts the oldest idle watcher beyond the idle cap", async () => {
		const fake = createFakeBackend();
		const [rootA, rootB, rootC] = await Promise.all([
			createTempRoot(),
			createTempRoot(),
			createTempRoot(),
		]);
		const manager = createManager(fake.backend, {
			idleKeepAliveMs: 60_000,
			maxIdleWatchers: 2,
		});

		const unsubscribeA = await manager.subscribe(
			{ absolutePath: rootA },
			() => {},
		);
		const unsubscribeB = await manager.subscribe(
			{ absolutePath: rootB },
			() => {},
		);
		const unsubscribeC = await manager.subscribe(
			{ absolutePath: rootC },
			() => {},
		);

		await unsubscribeA();
		await unsubscribeB();
		expect(fake.live(rootA)).toHaveLength(1);
		expect(fake.live(rootB)).toHaveLength(1);

		await unsubscribeC();
		await waitUntil(() => fake.live(rootA).length === 0, "eviction of A");
		expect(fake.live(rootB)).toHaveLength(1);
		expect(fake.live(rootC)).toHaveLength(1);
	});

	it("does not count a re-subscribed watcher against the idle cap", async () => {
		const fake = createFakeBackend();
		const [rootA, rootB] = await Promise.all([
			createTempRoot(),
			createTempRoot(),
		]);
		const manager = createManager(fake.backend, {
			idleKeepAliveMs: 60_000,
			maxIdleWatchers: 1,
		});

		const unsubscribeA = await manager.subscribe(
			{ absolutePath: rootA },
			() => {},
		);
		const unsubscribeB = await manager.subscribe(
			{ absolutePath: rootB },
			() => {},
		);

		await unsubscribeA();
		await manager.subscribe({ absolutePath: rootA }, () => {});
		await unsubscribeB();

		await sleep(50);
		expect(fake.live(rootA)).toHaveLength(1);
		expect(fake.live(rootB)).toHaveLength(1);
	});

	it("close() disposes idle watchers and leaves no expiry behind", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		await manager.close();
		expect(fake.live(rootPath)).toHaveLength(0);

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		await sleep(250);
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("disposes immediately when the keep-alive is disabled", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend, { idleKeepAliveMs: 0 });

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		expect(fake.live(rootPath)).toHaveLength(0);
	});

	it("gives a subscribe racing an in-flight expiry a fresh watcher that survives the old teardown", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend, { idleKeepAliveMs: 30 });

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		const releaseUnsubscribe = fake.holdUnsubscribes();
		await unsubscribe();
		await sleep(80);

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		releaseUnsubscribe();

		await waitUntil(
			() => fake.subscriptions[0]?.disposed === true,
			"old teardown",
		);
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("releases a watcher whose root was deleted instead of keeping it idle", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend, { recoveryPollMs: 60_000 });

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		fake.subscriptions[0]?.request.onEvents([
			{ type: "delete", path: rootPath },
		]);
		await waitUntil(() => fake.live(rootPath).length === 0, "suspension");
		await unsubscribe();

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("attaches afresh when the idle watcher's root was deleted while idle", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend, {
			idleKeepAliveMs: 60_000,
			recoveryPollMs: 60_000,
		});

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		fake.subscriptions[0]?.request.onEvents([
			{ type: "delete", path: rootPath },
		]);
		await waitUntil(() => fake.live(rootPath).length === 0, "suspension");

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("attaches afresh when the root was replaced while idle and no delete event arrived", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend, { idleKeepAliveMs: 60_000 });

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		await fs.rm(rootPath, { recursive: true, force: true });
		await fs.mkdir(rootPath);

		await manager.subscribe({ absolutePath: rootPath }, () => {});
		expect(fake.subscriptions).toHaveLength(2);
		expect(fake.live(rootPath)).toHaveLength(1);
	});

	it("ignores a repeated unsubscribe so it cannot extend the grace period", async () => {
		const fake = createFakeBackend();
		const rootPath = await createTempRoot();
		const manager = createManager(fake.backend);

		const unsubscribe = await manager.subscribe(
			{ absolutePath: rootPath },
			() => {},
		);
		await unsubscribe();
		await sleep(60);
		await unsubscribe();

		await sleep(70);
		expect(fake.live(rootPath)).toHaveLength(0);
	});
});

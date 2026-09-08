import { expect, it, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FsWatcherManager } from "./watch";

type State = { subscription: { unsubscribe(): Promise<void> } | null };
type Internals = {
	createWatcher(root: string): Promise<State>;
	disposeWatcherState(state: State): Promise<void>;
};

it("shares a concurrent first attachment and releases every native subscription", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-concurrent-")),
	);
	const manager = new FsWatcherManager();
	const internal = manager as unknown as Internals;
	const create = internal.createWatcher.bind(manager);
	const states: State[] = [];
	const attach = spyOn(internal, "createWatcher").mockImplementation(
		async (root) => {
			const state = await create(root);
			states.push(state);
			return state;
		},
	);
	const dispose = spyOn(internal, "disposeWatcherState");
	try {
		const [first, second] = await Promise.all([
			manager.subscribe({ absolutePath: root }, () => {}),
			manager.subscribe({ absolutePath: root }, () => {}),
		]);
		await first();
		expect(dispose).toHaveBeenCalledTimes(0);
		await second();
		await manager.close();
		expect(attach).toHaveBeenCalledTimes(1);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(states.every((state) => state.subscription === null)).toBe(true);
	} finally {
		attach.mockRestore();
		dispose.mockRestore();
		// Also release orphaned states when run against the buggy implementation.
		await Promise.all(
			states.map((state) => internal.disposeWatcherState(state)),
		);
		await manager.close();
		await fs.rm(root, { recursive: true, force: true });
	}
});

it("close disposes an attachment still in flight and permits a fresh subscription", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-closing-")),
	);
	const manager = new FsWatcherManager();
	const internal = manager as unknown as Internals;
	const create = internal.createWatcher.bind(manager);
	let release!: () => void;
	let entered!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const states: State[] = [];
	const attach = spyOn(internal, "createWatcher").mockImplementation(
		async (root) => {
			const state = await create(root);
			states.push(state);
			entered();
			await gate;
			return state;
		},
	);
	try {
		const pending = manager.subscribe({ absolutePath: root }, () => {});
		const outcome = pending.then(
			() => null,
			(error: Error) => error.message,
		);
		await started;
		const closing = manager.close();
		release();
		await closing;
		expect(await outcome).toBe("Filesystem watcher closed during attachment");
		expect(states.every((state) => state.subscription === null)).toBe(true);
		attach.mockRestore();
		const unsubscribe = await manager.subscribe(
			{ absolutePath: root },
			() => {},
		);
		await unsubscribe();
	} finally {
		release();
		attach.mockRestore();
		await manager.close();
		await Promise.all(
			states.map((state) => internal.disposeWatcherState(state)),
		);
		await fs.rm(root, { recursive: true, force: true });
	}
});

it("a failed shared attachment does not poison later subscriptions", async () => {
	const root = await fs.realpath(
		await fs.mkdtemp(path.join(os.tmpdir(), "watch-retry-")),
	);
	const manager = new FsWatcherManager();
	const internal = manager as unknown as Internals;
	const attach = spyOn(internal, "createWatcher").mockRejectedValueOnce(
		new Error("attach failed"),
	);
	try {
		const results = await Promise.allSettled([
			manager.subscribe({ absolutePath: root }, () => {}),
			manager.subscribe({ absolutePath: root }, () => {}),
		]);
		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(attach).toHaveBeenCalledTimes(1);
		attach.mockRestore();
		const unsubscribe = await manager.subscribe(
			{ absolutePath: root },
			() => {},
		);
		await unsubscribe();
	} finally {
		attach.mockRestore();
		await manager.close();
		await fs.rm(root, { recursive: true, force: true });
	}
});

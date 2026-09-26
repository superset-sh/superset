import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
	WatchAttachBackoffError,
	WatchAttachGuard,
} from "./watch-attach-guard";

const ROOT = "/repo/worktree";
const ENOENT =
	"inotify_add_watch on '/repo/worktree/captures' failed: No such file or directory";

let errorSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
	errorSpy = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	errorSpy.mockRestore();
});

function createGuard(subscribe: () => Promise<() => Promise<void>>) {
	let now = 0;
	const inner = { subscribe: mock(subscribe), close: mock(async () => {}) };
	const guard = new WatchAttachGuard(inner, {
		initialBackoffMs: 1_000,
		maxBackoffMs: 4_000,
		now: () => now,
	});
	return {
		guard,
		inner,
		attach: () => guard.subscribe({ absolutePath: ROOT }, () => {}),
		advance: (ms: number) => {
			now += ms;
		},
	};
}

test("a failed native attach is not retried until its backoff elapses", async () => {
	const { guard, inner, attach, advance } = createGuard(async () => {
		throw new Error(ENOENT);
	});

	await expect(attach()).rejects.toThrow(ENOENT);
	expect(guard.isBackingOff(ROOT)).toBe(true);

	await expect(attach()).rejects.toBeInstanceOf(WatchAttachBackoffError);
	advance(999);
	await expect(attach()).rejects.toBeInstanceOf(WatchAttachBackoffError);
	expect(inner.subscribe).toHaveBeenCalledTimes(1);

	advance(1);
	expect(guard.isBackingOff(ROOT)).toBe(false);
	await expect(attach()).rejects.toThrow(ENOENT);
	expect(inner.subscribe).toHaveBeenCalledTimes(2);
});

test("backoff doubles per consecutive failure up to the cap", async () => {
	const { guard, inner, attach, advance } = createGuard(async () => {
		throw new Error(ENOENT);
	});

	for (const delayMs of [1_000, 2_000, 4_000, 4_000]) {
		await expect(attach()).rejects.toThrow(ENOENT);
		advance(delayMs - 1);
		expect(guard.isBackingOff(ROOT)).toBe(true);
		advance(1);
		expect(guard.isBackingOff(ROOT)).toBe(false);
	}
	expect(inner.subscribe).toHaveBeenCalledTimes(4);
});

test("a successful attach clears the failure history", async () => {
	let fail = true;
	const { guard, attach, advance } = createGuard(async () => {
		if (fail) throw new Error(ENOENT);
		return async () => {};
	});

	await expect(attach()).rejects.toThrow(ENOENT);
	advance(1_000);
	await expect(attach()).rejects.toThrow(ENOENT);
	advance(2_000);
	fail = false;
	await attach();
	expect(guard.isBackingOff(ROOT)).toBe(false);

	fail = true;
	await expect(attach()).rejects.toThrow(ENOENT);
	advance(1_000);
	expect(guard.isBackingOff(ROOT)).toBe(false);
});

test("a path refused before reaching the native layer does not back off", async () => {
	const { guard, inner, attach } = createGuard(async () => {
		throw new Error(`Cannot watch path: path does not exist: ${ROOT}`);
	});

	await expect(attach()).rejects.toThrow("path does not exist");
	expect(guard.isBackingOff(ROOT)).toBe(false);
	await expect(attach()).rejects.toThrow("path does not exist");
	expect(inner.subscribe).toHaveBeenCalledTimes(2);
});

test("concurrent attaches of one root reach the native layer one at a time", async () => {
	let running = 0;
	let maxRunning = 0;
	const { inner, attach } = createGuard(async () => {
		running += 1;
		maxRunning = Math.max(maxRunning, running);
		await new Promise((resolve) => setTimeout(resolve, 5));
		running -= 1;
		return async () => {};
	});

	await Promise.all([attach(), attach(), attach()]);
	expect(inner.subscribe).toHaveBeenCalledTimes(3);
	expect(maxRunning).toBe(1);
});

test("a second attach queued behind a failing one is refused without touching native", async () => {
	const { inner, attach } = createGuard(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		throw new Error(ENOENT);
	});

	const results = await Promise.allSettled([attach(), attach()]);
	expect(results.map((result) => result.status)).toEqual([
		"rejected",
		"rejected",
	]);
	expect(inner.subscribe).toHaveBeenCalledTimes(1);
});

test("cancelling initialization does not put the next attach into backoff", async () => {
	const controller = new AbortController();
	let first = true;
	const { guard, attach } = createGuard(async () => {
		if (first) {
			first = false;
			controller.abort();
			throw controller.signal.reason;
		}
		return async () => {};
	});
	await expect(
		guard.subscribe(
			{ absolutePath: ROOT, signal: controller.signal },
			() => {},
		),
	).rejects.toThrow();
	expect(guard.isBackingOff(ROOT)).toBe(false);
	await expect(attach()).resolves.toBeFunction();
});

test("a cancelled caller queued behind an attach never reaches the watcher", async () => {
	let release: () => void = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const { guard, inner, attach } = createGuard(async () => {
		await pending;
		return async () => {};
	});
	const first = attach();
	const controller = new AbortController();
	const second = guard
		.subscribe({ absolutePath: ROOT, signal: controller.signal }, () => {})
		.catch((error) => error);
	controller.abort();
	release();
	await first;
	expect(await second).toBe(controller.signal.reason);
	expect(inner.subscribe).toHaveBeenCalledTimes(1);
	expect(guard.isBackingOff(ROOT)).toBe(false);
});

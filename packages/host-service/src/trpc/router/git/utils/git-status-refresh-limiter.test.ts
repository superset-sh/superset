import { describe, expect, test } from "bun:test";
import { GitStatusRefreshLimiter } from "./git-status-refresh-limiter";

function deferred<T = void>() {
	let resolve: (value: T | PromiseLike<T>) => void = () => {};
	let reject: (reason?: unknown) => void = () => {};
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("GitStatusRefreshLimiter", () => {
	test("keeps one trailing refresh for the same workspace and request key", async () => {
		const limiter = new GitStatusRefreshLimiter(4);
		const firstGate = deferred();
		const secondGate = deferred();
		let runs = 0;

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				runs++;
				await firstGate.promise;
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				runs++;
				await secondGate.promise;
				return "second";
			},
		});
		const third = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				runs++;
				return "third";
			},
		});

		expect(second).not.toBe(first);
		expect(third).toBe(second);
		expect(runs).toBe(0);
		await Promise.resolve();
		expect(runs).toBe(1);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(runs).toBe(2);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
		await expect(third).resolves.toBe("second");
		expect(runs).toBe(2);
	});

	test("serializes different request keys for the same workspace", async () => {
		const limiter = new GitStatusRefreshLimiter(4);
		const firstGate = deferred();
		const secondGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:release",
			run: async () => {
				events.push("second:start");
				await secondGate.promise;
				events.push("second:end");
				return "second";
			},
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end", "second:start"]);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
		expect(events).toEqual([
			"first:start",
			"first:end",
			"second:start",
			"second:end",
		]);
	});

	test("caps active refreshes across workspaces", async () => {
		const limiter = new GitStatusRefreshLimiter(1);
		const firstGate = deferred();
		const secondGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			run: async () => {
				events.push("second:start");
				await secondGate.promise;
				events.push("second:end");
				return "second";
			},
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end", "second:start"]);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
	});

	test("prioritizes foreground work over stale background work", async () => {
		const limiter = new GitStatusRefreshLimiter(1);
		const firstGate = deferred();
		const secondGate = deferred();
		const thirdGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			priority: "background",
			run: async () => {
				events.push("second:start");
				await secondGate.promise;
				events.push("second:end");
				return "second";
			},
		});
		const third = limiter.run({
			workspaceId: "workspace-3",
			requestKey: "base:main",
			run: async () => {
				events.push("third:start");
				await thirdGate.promise;
				events.push("third:end");
				return "third";
			},
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end", "third:start"]);

		thirdGate.resolve();
		await expect(third).resolves.toBe("third");
		await Promise.resolve();
		expect(events).toEqual([
			"first:start",
			"first:end",
			"third:start",
			"third:end",
			"second:start",
		]);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
	});

	test("runs same-priority work in queue order so requests do not starve", async () => {
		const limiter = new GitStatusRefreshLimiter(1);
		const firstGate = deferred();
		const secondGate = deferred();
		const thirdGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			run: async () => {
				events.push("second:start");
				await secondGate.promise;
				events.push("second:end");
				return "second";
			},
		});
		const third = limiter.run({
			workspaceId: "workspace-3",
			requestKey: "base:main",
			run: async () => {
				events.push("third:start");
				await thirdGate.promise;
				events.push("third:end");
				return "third";
			},
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end", "second:start"]);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
		await Promise.resolve();
		expect(events).toEqual([
			"first:start",
			"first:end",
			"second:start",
			"second:end",
			"third:start",
		]);

		thirdGate.resolve();
		await expect(third).resolves.toBe("third");
	});

	test("promotes a queued background refresh when a foreground request joins it", async () => {
		const limiter = new GitStatusRefreshLimiter(1);
		const firstGate = deferred();
		const secondGate = deferred();
		const thirdGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			priority: "background",
			run: async () => {
				events.push("second:start");
				await secondGate.promise;
				events.push("second:end");
				return "second";
			},
		});
		const third = limiter.run({
			workspaceId: "workspace-3",
			requestKey: "base:main",
			priority: "background",
			run: async () => {
				events.push("third:start");
				await thirdGate.promise;
				events.push("third:end");
				return "third";
			},
		});
		const promotedSecond = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			run: async () => {
				events.push("promoted-second:start");
				return "promoted-second";
			},
		});

		expect(promotedSecond).toBe(second);

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end", "second:start"]);

		secondGate.resolve();
		await expect(second).resolves.toBe("second");
		await expect(promotedSecond).resolves.toBe("second");
		await Promise.resolve();
		expect(events).toEqual([
			"first:start",
			"first:end",
			"second:start",
			"second:end",
			"third:start",
		]);

		thirdGate.resolve();
		await expect(third).resolves.toBe("third");
	});

	test("clear rejects queued work and lets active work finish without reviving stale queues", async () => {
		const limiter = new GitStatusRefreshLimiter(1);
		const firstGate = deferred();
		const events: string[] = [];

		const first = limiter.run({
			workspaceId: "workspace-1",
			requestKey: "base:main",
			run: async () => {
				events.push("first:start");
				await firstGate.promise;
				events.push("first:end");
				return "first";
			},
		});
		const second = limiter.run({
			workspaceId: "workspace-2",
			requestKey: "base:main",
			run: async () => {
				events.push("second:start");
				return "second";
			},
		});

		await Promise.resolve();
		expect(events).toEqual(["first:start"]);

		limiter.clear();
		await expect(second).rejects.toThrow("queue was cleared");

		firstGate.resolve();
		await expect(first).resolves.toBe("first");
		await Promise.resolve();
		expect(events).toEqual(["first:start", "first:end"]);

		const third = limiter.run({
			workspaceId: "workspace-3",
			requestKey: "base:main",
			run: async () => {
				events.push("third:start");
				return "third";
			},
		});

		await expect(third).resolves.toBe("third");
		expect(events).toEqual(["first:start", "first:end", "third:start"]);
	});
});

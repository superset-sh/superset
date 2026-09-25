import { expect, mock, test } from "bun:test";
import type { HostDb } from "../db";
import {
	cancelAndWaitWorkspaceTitleCommit,
	cancelWorkspaceTitleJob,
	commitWorkspaceTitleJob,
	disposeWorkspaceTitleJobs,
	queueWorkspaceTitleJob,
} from "./workspace-title-jobs";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("title jobs bound concurrency and pending work without blocking callers", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	let active = 0;
	let maximum = 0;
	const run = mock(async () => {
		active++;
		maximum = Math.max(maximum, active);
		await gate.promise;
		active--;
	});
	for (let i = 0; i < 100; i++) queueWorkspaceTitleJob(db, String(i), run);
	await tick();
	expect(run).toHaveBeenCalledTimes(2);
	gate.resolve();
	await tick();
	expect(run).toHaveBeenCalledTimes(34);
	expect(maximum).toBe(2);
});

test("duplicate jobs are deduplicated and cancelled queued jobs never start", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	const run = mock(() => gate.promise);
	queueWorkspaceTitleJob(db, "first", run);
	queueWorkspaceTitleJob(db, "second", run);
	queueWorkspaceTitleJob(db, "queued", run);
	queueWorkspaceTitleJob(db, "first", run);
	queueWorkspaceTitleJob(db, "queued", run);
	cancelWorkspaceTitleJob(db, "queued");
	await tick();
	gate.resolve();
	await tick();
	expect(run).toHaveBeenCalledTimes(2);
});

test("an old job cannot become current again when a replacement is queued", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	let oldCurrent: boolean | undefined;
	queueWorkspaceTitleJob(db, "workspace", async (isCurrent) => {
		await gate.promise;
		oldCurrent = isCurrent();
	});
	await tick();
	cancelWorkspaceTitleJob(db, "workspace");
	const next = mock(async (isCurrent: () => boolean) => {
		expect(isCurrent()).toBe(true);
	});
	queueWorkspaceTitleJob(db, "workspace", next);
	gate.resolve();
	await tick();
	expect(oldCurrent).toBe(false);
	expect(next).toHaveBeenCalledTimes(1);
});

test("disposal aborts active work, discards queued jobs and rejects later scheduling", async () => {
	const db = {} as HostDb;
	const otherDb = {} as HostDb;
	const cleanup = Promise.withResolvers<void>();
	let signal: AbortSignal | undefined;
	let current: (() => boolean) | undefined;
	queueWorkspaceTitleJob(db, "first", async (isCurrent, abortSignal) => {
		signal = abortSignal;
		current = isCurrent;
		await cleanup.promise;
	});
	queueWorkspaceTitleJob(db, "second", async () => cleanup.promise);
	const pending = mock(async () => {});
	queueWorkspaceTitleJob(db, "pending", pending);
	await tick();
	let disposed = false;
	const disposal = disposeWorkspaceTitleJobs(db).then(() => {
		disposed = true;
	});
	expect(signal?.aborted).toBe(true);
	expect(current?.()).toBe(false);
	queueWorkspaceTitleJob(db, "later", pending);
	const independent = mock(async () => {});
	queueWorkspaceTitleJob(otherDb, "first", independent);
	await tick();
	expect(disposed).toBe(false);
	expect(independent).toHaveBeenCalledTimes(1);
	cleanup.resolve();
	await disposal;
	expect(pending).not.toHaveBeenCalled();
	await disposeWorkspaceTitleJobs(db);
});

test("disposal also retires a database that has never scheduled naming", async () => {
	const db = {} as HostDb;
	await disposeWorkspaceTitleJobs(db);
	const run = mock(async () => {});
	queueWorkspaceTitleJob(db, "late", run);
	await tick();
	expect(run).not.toHaveBeenCalled();
});

test("disposal remains bounded when a generator ignores abort", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	let current: (() => boolean) | undefined;
	queueWorkspaceTitleJob(db, "stuck", async (isCurrent) => {
		current = isCurrent;
		await gate.promise;
	});
	await tick();
	try {
		await disposeWorkspaceTitleJobs(db);
		expect(current?.()).toBe(false);
	} finally {
		gate.resolve();
		await tick();
	}
}, 2000);

test("cancellation aborts generation but holds capacity until cleanup finishes", async () => {
	const db = {} as HostDb;
	const cleanup = Promise.withResolvers<void>();
	const signals: AbortSignal[] = [];
	for (const id of ["first", "second"]) {
		queueWorkspaceTitleJob(db, id, async (_isCurrent, signal) => {
			signals.push(signal);
			await cleanup.promise;
		});
	}
	const next = mock(async () => {});
	queueWorkspaceTitleJob(db, "next", next);
	await tick();
	cancelWorkspaceTitleJob(db, "first");
	cancelWorkspaceTitleJob(db, "second");
	expect(signals.every((signal) => signal.aborted)).toBe(true);
	await tick();
	expect(next).not.toHaveBeenCalled();
	cleanup.resolve();
	await tick();
	expect(next).toHaveBeenCalledTimes(1);
});

for (const action of ["dispose", "delete"] as const) {
	test(`${action} waits for an in-flight Git rename to reconcile its database row`, async () => {
		const db = {} as HostDb;
		const entered = Promise.withResolvers<void>();
		const renamed = Promise.withResolvers<void>();
		let reconciled = false;
		queueWorkspaceTitleJob(db, "workspace", async () => {
			await commitWorkspaceTitleJob(db, "workspace", async () => {
				entered.resolve();
				await renamed.promise;
				reconciled = true;
			});
		});
		await entered.promise;
		let completed = false;
		const cleanup = (
			action === "dispose"
				? disposeWorkspaceTitleJobs(db)
				: cancelAndWaitWorkspaceTitleCommit(db, "workspace")
		).then(() => {
			completed = true;
		});
		await tick();
		expect(completed).toBe(false);
		renamed.resolve();
		await cleanup;
		expect(reconciled).toBe(true);
	});
}

test("cancelling a pending generator does not wait for the provider", async () => {
	const db = {} as HostDb;
	const generated = Promise.withResolvers<void>();
	const commit = mock(async () => {});
	queueWorkspaceTitleJob(db, "workspace", async () => {
		await generated.promise;
		await commitWorkspaceTitleJob(db, "workspace", commit);
	});
	await tick();
	await cancelAndWaitWorkspaceTitleCommit(db, "workspace");
	generated.resolve();
	await tick();
	expect(commit).not.toHaveBeenCalled();
});

for (const action of ["start", "cancel", "dispose"] as const) {
	test(`first-work naming waits without occupying a running slot and handles ${action}`, async () => {
		const db = {} as HostDb;
		const run = mock(async () => {});
		const unsubscribe = mock(() => {});
		let start: (() => void) | undefined;
		queueWorkspaceTitleJob(db, "waiting", run, (activate) => {
			start = activate;
			return unsubscribe;
		});
		const immediate = mock(async () => {});
		queueWorkspaceTitleJob(db, "immediate", immediate);
		await tick();
		expect(immediate).toHaveBeenCalledTimes(1);
		expect(run).not.toHaveBeenCalled();
		if (action === "cancel") cancelWorkspaceTitleJob(db, "waiting");
		if (action === "dispose") await disposeWorkspaceTitleJobs(db);
		start?.();
		start?.();
		await tick();
		expect(run).toHaveBeenCalledTimes(action === "start" ? 1 : 0);
		expect(unsubscribe).toHaveBeenCalledTimes(1);
	});
}

test("abandoned first-work waiters cannot block ready jobs or fresh waiters", async () => {
	const db = {} as HostDb;
	const starts: Array<() => void> = [];
	const unsubscribed = new Set<number>();
	const ran: number[] = [];
	for (let i = 0; i < 100; i++) {
		queueWorkspaceTitleJob(
			db,
			`waiting-${i}`,
			async () => {
				ran.push(i);
			},
			(start) => {
				starts.push(start);
				return () => {
					unsubscribed.add(i);
				};
			},
		);
	}
	const ready = mock(async () => {});
	queueWorkspaceTitleJob(db, "ready", ready);
	await tick();
	expect(ready).toHaveBeenCalledTimes(1);
	expect(starts).toHaveLength(100);
	expect(unsubscribed.size).toBe(68);
	starts[0]?.();
	starts[99]?.();
	await tick();
	expect(ran).toEqual([99]);
	await disposeWorkspaceTitleJobs(db);
	expect(unsubscribed.size).toBe(100);
});

test("first-work bursts respect runnable capacity independently of waiting admission", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	const run = mock(() => gate.promise);
	for (let i = 0; i < 34; i++) queueWorkspaceTitleJob(db, `ready-${i}`, run);
	const starts: Array<() => void> = [];
	const unsubscribe = mock(() => {});
	const overflow = mock(async () => {});
	for (let i = 0; i < 32; i++) {
		queueWorkspaceTitleJob(db, `waiting-${i}`, overflow, (start) => {
			starts.push(start);
			return unsubscribe;
		});
	}
	expect(starts).toHaveLength(32);
	for (const start of starts) start();
	await tick();
	expect(run).toHaveBeenCalledTimes(2);
	expect(overflow).not.toHaveBeenCalled();
	expect(unsubscribe).toHaveBeenCalledTimes(32);
	gate.resolve();
	await tick();
	expect(run).toHaveBeenCalledTimes(34);
	expect(overflow).not.toHaveBeenCalled();
	await disposeWorkspaceTitleJobs(db);
});

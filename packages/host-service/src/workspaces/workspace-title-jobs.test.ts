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

test("a job queued behind a pending one runs once after it, latest wins; cancelled jobs never start", async () => {
	const db = {} as HostDb;
	const gate = Promise.withResolvers<void>();
	const run = mock(() => gate.promise);
	const stale = mock(async () => {});
	const followUp = mock(async () => {});
	queueWorkspaceTitleJob(db, "first", run);
	queueWorkspaceTitleJob(db, "second", run);
	queueWorkspaceTitleJob(db, "queued", run);
	queueWorkspaceTitleJob(db, "first", stale);
	queueWorkspaceTitleJob(db, "first", followUp);
	queueWorkspaceTitleJob(db, "queued", run);
	cancelWorkspaceTitleJob(db, "queued");
	await tick();
	expect(followUp).not.toHaveBeenCalled();
	gate.resolve();
	await tick();
	await tick();
	expect(run).toHaveBeenCalledTimes(2);
	expect(stale).not.toHaveBeenCalled();
	expect(followUp).toHaveBeenCalledTimes(1);
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
		await disposeWorkspaceTitleJobs(db, 20);
		expect(current?.()).toBe(false);
	} finally {
		gate.resolve();
		await tick();
	}
});

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

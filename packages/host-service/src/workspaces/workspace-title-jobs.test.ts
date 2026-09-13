import { expect, mock, test } from "bun:test";
import type { HostDb } from "../db";
import {
	cancelWorkspaceTitleJob,
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

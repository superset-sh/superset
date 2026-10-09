import { describe, expect, test } from "bun:test";
import { sessionEndedAt } from "../../lib/sandbox/vercel";
import { boxMinutes, meteringCutoff, observedMs, unreportedMs } from "./meter";

const row = {
	id: "sess_1",
	cloudWorkspaceId: "00000000-0000-0000-0000-000000000001",
	vcpus: 8,
	startedAt: new Date(0),
	stoppedAt: null as Date | null,
	observedMs: 0,
	reportedMs: 0,
	inflightToMs: null as number | null,
	createdAt: new Date(0),
	updatedAt: new Date(0),
};

describe("meter", () => {
	test("a box-minute is a minute of a 4 vCPU box", () => {
		expect(boxMinutes(60_000, 4)).toBe(1);
		expect(boxMinutes(60_000, 8)).toBe(2);
		expect(boxMinutes(30_000, 2)).toBe(0.25);
	});

	test("a running session counts up to now, a stopped one up to its stop", () => {
		const session = { id: "s", vcpus: 4, startedAt: 1_000, endedAt: null };
		expect(observedMs(session, 61_000)).toBe(60_000);
		expect(observedMs({ ...session, endedAt: 31_000 }, 61_000)).toBe(30_000);
	});

	test("a running session waits for a full minute, a stopped one reports the rest", () => {
		expect(
			unreportedMs({ ...row, observedMs: 90_000, reportedMs: 60_000 }),
		).toBe(0);
		expect(
			unreportedMs({ ...row, observedMs: 130_000, reportedMs: 60_000 }),
		).toBe(70_000);
		expect(
			unreportedMs({
				...row,
				stoppedAt: new Date(90_000),
				observedMs: 90_000,
				reportedMs: 60_000,
			}),
		).toBe(30_000);
	});

	test("a session still open is read again until Vercel reports its stop", () => {
		expect(
			meteringCutoff({
				oldestOpenStart: new Date(1_000),
				lastStop: new Date(5_000),
				workspaceCreatedAt: new Date(0),
			}),
		).toBe(1_000);
		expect(
			meteringCutoff({
				oldestOpenStart: null,
				lastStop: new Date(5_000),
				workspaceCreatedAt: new Date(0),
			}),
		).toBe(5_000);
		expect(
			meteringCutoff({
				oldestOpenStart: null,
				lastStop: null,
				workspaceCreatedAt: new Date(7),
			}),
		).toBe(7);
	});

	test("a session that ended without a stop time ends at its last update", () => {
		expect(sessionEndedAt({ status: "running", updatedAt: 9 })).toBeNull();
		expect(
			sessionEndedAt({ status: "stopped", stoppedAt: 5, updatedAt: 9 }),
		).toBe(5);
		expect(
			sessionEndedAt({ status: "stopping", requestedStopAt: 4, updatedAt: 9 }),
		).toBe(4);
		expect(sessionEndedAt({ status: "aborted", updatedAt: 9 })).toBe(9);
	});
});

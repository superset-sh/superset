import { describe, expect, it } from "bun:test";
import {
	type MissVerdictInput,
	runVerdictWindow,
	shouldStartResolution,
} from "./useWorkspaceMissVerdict";

const base: MissVerdictInput = {
	workspaceId: "ws-1",
	workspaceFound: false,
	suspended: false,
	hasLiveTargets: true,
};

describe("shouldStartResolution", () => {
	it("starts for a routed, unfound, unsuspended id with live targets", () => {
		expect(shouldStartResolution(base, null)).toBe(true);
	});

	it("does not start without a routed workspaceId", () => {
		expect(shouldStartResolution({ ...base, workspaceId: null }, null)).toBe(
			false,
		);
	});

	it("does not start when the row is already in the mirror", () => {
		expect(shouldStartResolution({ ...base, workspaceFound: true }, null)).toBe(
			false,
		);
	});

	it("does not start while a create transaction or failed entry owns the id", () => {
		expect(shouldStartResolution({ ...base, suspended: true }, null)).toBe(
			false,
		);
	});

	it("waits for a reachable host before starting", () => {
		expect(
			shouldStartResolution({ ...base, hasLiveTargets: false }, null),
		).toBe(false);
	});

	it("does not restart an already-attempted id", () => {
		expect(shouldStartResolution(base, "ws-1")).toBe(false);
	});

	it("restarts when the routed id changes", () => {
		expect(shouldStartResolution(base, "ws-0")).toBe(true);
	});
});

describe("runVerdictWindow", () => {
	it("settles when the refetch settles and cancels the cap", async () => {
		let capCancelled = false;
		const schedule = () => () => {
			capCancelled = true;
		};
		await runVerdictWindow(() => Promise.resolve(), 5_000, schedule);
		expect(capCancelled).toBe(true);
	});

	it("settles even when the refetch rejects", async () => {
		await runVerdictWindow(
			() => Promise.reject(new Error("host unreachable")),
			5_000,
			() => () => {},
		);
	});

	it("settles at the cap when the refetch hangs", async () => {
		let fireCap = () => {};
		const schedule = (fn: () => void) => {
			fireCap = fn;
			return () => {};
		};
		const window = runVerdictWindow(
			() => new Promise<void>(() => {}),
			5_000,
			schedule,
		);
		fireCap();
		await window;
	});
});

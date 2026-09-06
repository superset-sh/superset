import { describe, expect, it } from "bun:test";
import {
	type MissVerdictInput,
	planVerdictAction,
	runVerdictWindow,
} from "./useWorkspaceMissVerdict";

const base: MissVerdictInput = {
	workspaceId: "ws-1",
	workspaceFound: false,
	suspended: false,
	hostsEnumerated: true,
	localHostDown: false,
};

describe("planVerdictAction", () => {
	it("opens a window for a routed, unfound, unsuspended id with the local host up", () => {
		expect(planVerdictAction(base)).toBe("open-window");
	});

	it("does nothing without a routed workspaceId", () => {
		expect(planVerdictAction({ ...base, workspaceId: null })).toBe("none");
	});

	it("does nothing when the row is already in the mirror", () => {
		expect(planVerdictAction({ ...base, workspaceFound: true })).toBe("none");
	});

	it("does nothing while a create transaction or failed entry owns the id", () => {
		expect(planVerdictAction({ ...base, suspended: true })).toBe("none");
	});

	it("waits for the host list to settle before judging (remote hosts may be unenumerated)", () => {
		expect(planVerdictAction({ ...base, hostsEnumerated: false })).toBe("none");
	});

	it("never judges while the local host-service has no port (starting, crash loop, gave up)", () => {
		expect(planVerdictAction({ ...base, localHostDown: true })).toBe("none");
	});
});

describe("runVerdictWindow", () => {
	it("reports an answer when the refetch resolves answered, and cancels the cap", async () => {
		let capCancelled = false;
		const schedule = () => () => {
			capCancelled = true;
		};
		const answered = await runVerdictWindow(
			() => Promise.resolve(true),
			5_000,
			schedule,
		);
		expect(answered).toBe(true);
		expect(capCancelled).toBe(true);
	});

	it("reports no answer when every host errored", async () => {
		const answered = await runVerdictWindow(
			() => Promise.resolve(false),
			5_000,
			() => () => {},
		);
		expect(answered).toBe(false);
	});

	it("reports no answer when the refetch rejects", async () => {
		const answered = await runVerdictWindow(
			() => Promise.reject(new Error("host unreachable")),
			5_000,
			() => () => {},
		);
		expect(answered).toBe(false);
	});

	it("reports no answer at the cap when the refetch hangs", async () => {
		let fireCap = () => {};
		const schedule = (fn: () => void) => {
			fireCap = fn;
			return () => {};
		};
		const window = runVerdictWindow(
			() => new Promise<boolean>(() => {}),
			5_000,
			schedule,
		);
		fireCap();
		expect(await window).toBe(false);
	});
});

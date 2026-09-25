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
	hasLiveTargets: true,
	mirrorSettled: true,
};

describe("planVerdictAction", () => {
	it("opens a window for a routed, unfound, unsuspended id with live targets", () => {
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

	it("waits while no host is reachable and the mirror has not settled (boot)", () => {
		expect(
			planVerdictAction({
				...base,
				hasLiveTargets: false,
				mirrorSettled: false,
			}),
		).toBe("none");
	});

	it("declares an immediate miss when offline with a settled mirror", () => {
		expect(
			planVerdictAction({
				...base,
				hasLiveTargets: false,
				mirrorSettled: true,
			}),
		).toBe("immediate-miss");
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

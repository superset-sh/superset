import { describe, expect, it } from "bun:test";
import {
	canOfferHostUpdate,
	getHostUpdateLifecycleDecision,
	type HostUpdateLifecycleDecision,
	type TerminalVerificationState,
} from "./host-version-lifecycle";

const EXPECTED_VERSION = "1.14.0-2";
const NOW = 1_000_000;
const RECENT_WINDOW_MS = 120_000;

describe("getHostUpdateLifecycleDecision", () => {
	it("does not trust a cached updating status before the mount fetch", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: { status: "updating", targetVersion: EXPECTED_VERSION },
				isFetchedAfterMount: false,
				runningVersion: "1.14.0-1",
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "checking" });
	});

	it("resumes a freshly observed update", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: { status: "updating", targetVersion: EXPECTED_VERSION },
				isFetchedAfterMount: true,
				runningVersion: "1.14.0-1",
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "resume", targetVersion: EXPECTED_VERSION });
	});

	it("does not resume when host info already proves the target is running", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: { status: "updating", targetVersion: EXPECTED_VERSION },
				isFetchedAfterMount: true,
				runningVersion: EXPECTED_VERSION,
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "settled" });
	});

	it("resumes exact verification for a recently completed update", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: {
					status: "succeeded",
					targetVersion: EXPECTED_VERSION,
					completedAt: NOW - 1_000,
				},
				isFetchedAfterMount: true,
				runningVersion: "1.14.0-1",
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "resume", targetVersion: EXPECTED_VERSION });
	});

	it("verifies an historical successful result once when host info differs", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: {
					status: "succeeded",
					targetVersion: EXPECTED_VERSION,
					completedAt: 123,
				},
				isFetchedAfterMount: true,
				runningVersion: "1.14.0-1",
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({
			kind: "verify",
			targetVersion: EXPECTED_VERSION,
			resultKey: `${EXPECTED_VERSION}:123`,
		});
	});

	it("settles completed and failed history without repeated lifecycle work", () => {
		expect(
			getHostUpdateLifecycleDecision({
				status: {
					status: "succeeded",
					targetVersion: EXPECTED_VERSION,
					completedAt: 123,
				},
				isFetchedAfterMount: true,
				runningVersion: EXPECTED_VERSION,
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "settled" });
		expect(
			getHostUpdateLifecycleDecision({
				status: {
					status: "failed",
					targetVersion: EXPECTED_VERSION,
					completedAt: 123,
				},
				isFetchedAfterMount: true,
				runningVersion: "1.14.0-1",
				expectedVersion: EXPECTED_VERSION,
				now: NOW,
				recentCompletionWindowMs: RECENT_WINDOW_MS,
			}),
		).toEqual({ kind: "settled" });
	});
});

describe("canOfferHostUpdate", () => {
	function canOffer(
		lifecycle: HostUpdateLifecycleDecision,
		terminalVerification: TerminalVerificationState = "not-needed",
	) {
		return canOfferHostUpdate({
			versionState: "outdated",
			canUpdate: true,
			isOnline: true,
			supportsRemoteUpdate: true,
			isRequestPending: false,
			isAwaitingTarget: false,
			lifecycle,
			terminalVerification,
		});
	}

	it("blocks while status is untrusted or an update is active", () => {
		expect(canOffer({ kind: "checking" })).toBe(false);
		expect(canOffer({ kind: "resume", targetVersion: EXPECTED_VERSION })).toBe(
			false,
		);
	});

	it("blocks historical success until a fresh host-info verification", () => {
		const lifecycle: HostUpdateLifecycleDecision = {
			kind: "verify",
			targetVersion: EXPECTED_VERSION,
			resultKey: `${EXPECTED_VERSION}:123`,
		};
		expect(canOffer(lifecycle, "pending")).toBe(false);
		expect(canOffer(lifecycle, "failed")).toBe(false);
		expect(canOffer(lifecycle, "complete")).toBe(true);
	});

	it("offers an update only after the lifecycle is settled", () => {
		expect(canOffer({ kind: "settled" })).toBe(true);
		expect(
			canOfferHostUpdate({
				versionState: "newer",
				canUpdate: true,
				isOnline: true,
				supportsRemoteUpdate: true,
				isRequestPending: false,
				isAwaitingTarget: false,
				lifecycle: { kind: "settled" },
				terminalVerification: "not-needed",
			}),
		).toBe(false);
	});
});

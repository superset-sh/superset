import { describe, expect, it } from "bun:test";
import {
	loadFixtureExpectedOutput,
	loadFixtureRecords,
	toChatEnvelopes,
} from "./fixtures/utils";
import {
	materializeMastraDisplayState,
	serializeMastraDisplayState,
} from "./index";

const SCENARIOS = [
	"basic-auth-error",
	"late-abort",
	"crash-resume",
	"global-with-crash-service-events",
	"approval-question-plan-submit",
	"multi-turn-auth-error",
	"submit-with-file",
	"stop-control",
] as const;

describe("materializeMastraDisplayState fixtures", () => {
	for (const scenario of SCENARIOS) {
		it(`materializes display snapshot for ${scenario}`, () => {
			const display = materializeMastraDisplayState(
				toChatEnvelopes(loadFixtureRecords(scenario)),
			);
			expect(serializeMastraDisplayState(display)).toEqual(
				loadFixtureExpectedOutput(scenario),
			);
		});
	}

	it("captures running lifecycle and token usage in basic auth error fixture", () => {
		const display = materializeMastraDisplayState(
			toChatEnvelopes(loadFixtureRecords("basic-auth-error")),
		);
		const snapshot = serializeMastraDisplayState(display);

		expect(snapshot.isRunning).toBeFalse();
		expect(snapshot.currentMessage).toBeNull();
		expect(snapshot.tokenUsage).toEqual({
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
		});
	});

	it("captures pending question/plan/approval state transitions from submit control lane", () => {
		const display = materializeMastraDisplayState(
			toChatEnvelopes(loadFixtureRecords("approval-question-plan-submit")),
		);
		const snapshot = serializeMastraDisplayState(display);

		expect(snapshot.pendingApproval).toBeNull();
		expect(snapshot.pendingQuestion).toBeNull();
		expect(snapshot.pendingPlanApproval).toBeNull();
	});

	it("captures tool activity fields when present", () => {
		const display = materializeMastraDisplayState(
			toChatEnvelopes(loadFixtureRecords("approval-question-plan-submit")),
		);
		const snapshot = serializeMastraDisplayState(display);

		expect(typeof snapshot.activeTools).toBe("object");
		expect(typeof snapshot.toolInputBuffers).toBe("object");
	});

	it("keeps OM progress shape stable", () => {
		const display = materializeMastraDisplayState(
			toChatEnvelopes(loadFixtureRecords("approval-question-plan-submit")),
		);
		const snapshot = serializeMastraDisplayState(display);

		expect(snapshot.omProgress).toBeDefined();
		expect(typeof snapshot.omProgress.threshold).toBe("number");
		expect(typeof snapshot.omProgress.reflectionThreshold).toBe("number");
	});
});

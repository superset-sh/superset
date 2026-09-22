import { describe, expect, test } from "bun:test";
import { emitFeedbackOnce, isFeedbackEligible } from "./eligibility";

const cancellation = {
	status: "active" as const,
	cancel_at_period_end: true,
	cancel_at: null,
	canceled_at: 100,
	cancellation_details: {
		reason: "cancellation_requested" as const,
		comment: null,
		feedback: null,
	},
};

describe("cancellation feedback eligibility", () => {
	test("accepts voluntary Pro cancellation at the end of the wait", () => {
		expect(isFeedbackEligible(cancellation, 100)).toBe(true);
		expect(
			isFeedbackEligible({ ...cancellation, status: "canceled" }, 100),
		).toBe(true);
	});
	test("skips resumed subscriptions and superseded cancellation jobs", () => {
		expect(
			isFeedbackEligible({ ...cancellation, cancel_at_period_end: false }, 100),
		).toBe(false);
		expect(isFeedbackEligible({ ...cancellation, canceled_at: 200 }, 100)).toBe(
			false,
		);
	});
	test("skips payment failures, disputed payments, and existing written feedback", () => {
		for (const reason of ["payment_failed", "payment_disputed"] as const) {
			expect(
				isFeedbackEligible(
					{
						...cancellation,
						cancellation_details: {
							...cancellation.cancellation_details,
							reason,
						},
					},
					100,
				),
			).toBe(false);
		}
		expect(
			isFeedbackEligible(
				{
					...cancellation,
					cancellation_details: {
						...cancellation.cancellation_details,
						comment: "The terminal kept crashing",
					},
				},
				100,
			),
		).toBe(false);
	});
	test("accepts a scheduled cancel_at, but excludes past-due subscriptions", () => {
		expect(
			isFeedbackEligible(
				{ ...cancellation, cancel_at_period_end: false, cancel_at: 200 },
				100,
			),
		).toBe(true);
		expect(
			isFeedbackEligible({ ...cancellation, status: "past_due" }, 100),
		).toBe(false);
	});
});

describe("at-most-once campaign enrollment", () => {
	test("concurrent deliveries start only one email run", async () => {
		let claimed = false;
		let events = 0;
		const claim = async () => {
			if (claimed) return null;
			claimed = true;
			return "OK";
		};
		const emit = async () => {
			events++;
		};
		await Promise.all([
			emitFeedbackOnce({ claim, emit }),
			emitFeedbackOnce({ claim, emit }),
		]);
		expect(events).toBe(1);
	});
	test("an ambiguous Resend failure must not create a duplicate on retry", async () => {
		let claimed = false;
		let events = 0;
		const claim = async () => {
			if (claimed) return null;
			claimed = true;
			return "OK";
		};
		const emit = async () => {
			events++;
			throw new Error("response timed out");
		};
		await expect(emitFeedbackOnce({ claim, emit })).rejects.toThrow(
			"response timed out",
		);
		expect(await emitFeedbackOnce({ claim, emit })).toBe(false);
		expect(events).toBe(1);
	});
});

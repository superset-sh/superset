import { describe, expect, it } from "bun:test";
import { beginAttachAttempt, isCurrentAttachAttempt } from "./attach-attempt";

describe("attach-attempt", () => {
	it("advances the active attach token", () => {
		const attachAttemptRef = { current: 0 };

		const firstAttempt = beginAttachAttempt(attachAttemptRef);
		const secondAttempt = beginAttachAttempt(attachAttemptRef);

		expect(firstAttempt).toBe(1);
		expect(secondAttempt).toBe(2);
		expect(isCurrentAttachAttempt(attachAttemptRef, firstAttempt)).toBe(false);
		expect(isCurrentAttachAttempt(attachAttemptRef, secondAttempt)).toBe(true);
	});
});

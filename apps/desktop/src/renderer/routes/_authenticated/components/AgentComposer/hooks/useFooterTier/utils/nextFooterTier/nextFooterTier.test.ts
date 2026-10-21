import { describe, expect, test } from "bun:test";
import {
	FOOTER_TIER_PROMOTION_SLACK_PX,
	MAX_FOOTER_TIER,
	nextFooterTier,
} from "./nextFooterTier";

describe("nextFooterTier", () => {
	test("demotes one tier and records the width while the row overflows", () => {
		expect(
			nextFooterTier({
				currentTier: 0,
				width: 400,
				overflowing: true,
				demotionWidths: [],
			}),
		).toEqual({ tier: 1, demotionWidths: [400] });
	});

	test("stops at the last tier", () => {
		const step = nextFooterTier({
			currentTier: MAX_FOOTER_TIER,
			width: 200,
			overflowing: true,
			demotionWidths: [400, 300, 250],
		});
		expect(step.tier).toBe(MAX_FOOTER_TIER);
	});

	test("promotes only past the recorded width plus slack", () => {
		const demotionWidths = [400, 300];
		expect(
			nextFooterTier({
				currentTier: 2,
				width: 300 + FOOTER_TIER_PROMOTION_SLACK_PX - 1,
				overflowing: false,
				demotionWidths,
			}).tier,
		).toBe(2);
		expect(
			nextFooterTier({
				currentTier: 2,
				width: 400 + FOOTER_TIER_PROMOTION_SLACK_PX,
				overflowing: false,
				demotionWidths,
			}).tier,
		).toBe(0);
	});
});

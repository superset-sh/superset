import { describe, expect, test } from "bun:test";
import {
	type EnrichedSubscription,
	formatSubscriptionCancelled,
} from "./slack-blocks";

function createEnrichedSubscription(
	overrides: Partial<EnrichedSubscription> = {},
): EnrichedSubscription {
	return {
		organizationName: "Acme",
		planName: "Pro",
		stripeCustomerId: "cus_123",
		stripeSubscriptionId: "sub_123",
		seatCount: 3,
		pricePerSeatCents: 2000,
		currency: "usd",
		interval: "monthly",
		discount: null,
		accessEndsAt: new Date("2026-05-31T00:00:00.000Z"),
		cancellationDetails: null,
		...overrides,
	};
}

describe("formatSubscriptionCancelled", () => {
	test("includes Stripe cancellation details in Slack blocks", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: "Missing an admin approval workflow.",
					feedback: "missing_features",
					reason: "cancellation_requested",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain(
			"*Cancellation reason:*\\nMissing features",
		);
		expect(serializedBlocks).toContain(
			"*Stripe reason:*\\nCancellation requested",
		);
		expect(serializedBlocks).toContain(
			"*Comment:*\\nMissing an admin approval workflow.",
		);
	});

	test("renders unknown Stripe cancellation values without throwing", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: null,
					feedback: "pricing_changed",
					reason: "account_closed",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain(
			"*Cancellation reason:*\\nPricing changed",
		);
		expect(serializedBlocks).toContain("*Stripe reason:*\\nAccount closed");
	});

	test("escapes unknown cancellation feedback and reason values", () => {
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: null,
					feedback: "<@U123>",
					reason: "<!subteam^S123>",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).not.toContain("<@U123>");
		expect(serializedBlocks).not.toContain("<!subteam^S123>");
		expect(serializedBlocks).toContain(`&lt;@${"\u200B"}U123&gt;`);
		expect(serializedBlocks).toContain("&lt;!subteam^S123&gt;");
	});

	test("escapes and truncates cancellation comments for Slack", () => {
		const longComment = `<!channel> & <https://example.com|link> ${"a".repeat(510)}`;
		const blocks = formatSubscriptionCancelled(
			createEnrichedSubscription({
				cancellationDetails: {
					comment: longComment,
					feedback: "other",
					reason: "cancellation_requested",
				},
			}),
		);

		const serializedBlocks = JSON.stringify(blocks);

		expect(serializedBlocks).toContain("&lt;!channel&gt;");
		expect(serializedBlocks).toContain("&amp;");
		expect(serializedBlocks).toContain("&lt;https://example.com|link&gt;");
		expect(serializedBlocks).toContain("...");
	});
});

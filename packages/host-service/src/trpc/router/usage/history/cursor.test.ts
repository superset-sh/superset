import { describe, expect, test } from "bun:test";
import { cursorEventsToEntries } from "./cursor-events";

describe("cursorEventsToEntries", () => {
	test("maps events with token usage into priced entries", () => {
		const entries = cursorEventsToEntries(
			[
				{
					timestamp: "1787004840166",
					model: "composer-2.5",
					conversationId: "conv-1",
					tokenUsage: {
						inputTokens: 80,
						outputTokens: 190,
						cacheReadTokens: 20_160,
						totalCents: 0.4547,
					},
				},
				// Non-token events (no tokenUsage) are skipped.
				{ timestamp: "1787004840166", model: "composer-2.5" },
			],
			0,
		);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			agent: "cursor",
			model: "composer-2.5",
			sessionId: "conv-1",
			timestampMs: 1_787_004_840_166,
			uncachedInput: 80,
			cachedInput: 20_160,
			output: 190,
			costUsd: 0.4547 / 100,
		});
	});

	test("drops events before the cutoff and events without timestamps", () => {
		const entries = cursorEventsToEntries(
			[
				{
					timestamp: "1000",
					model: "composer-2.5",
					conversationId: "conv-1",
					tokenUsage: { inputTokens: 1, outputTokens: 1 },
				},
				{
					model: "composer-2.5",
					conversationId: "conv-2",
					tokenUsage: { inputTokens: 1, outputTokens: 1 },
				},
			],
			2000,
		);
		expect(entries).toHaveLength(0);
	});
});

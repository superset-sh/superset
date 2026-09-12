import { describe, expect, it } from "bun:test";
import { parseAgyTranscriptLine } from "./agy";

describe("parseAgyTranscriptLine", () => {
	it("parses Gemini-style usage metadata", () => {
		const entry = parseAgyTranscriptLine(
			JSON.stringify({
				created_at: "2026-08-28T12:00:00Z",
				model: { id: "gemini-3.1-pro" },
				response: {
					usageMetadata: {
						promptTokenCount: 100,
						cachedContentTokenCount: 25,
						candidatesTokenCount: 30,
						thoughtsTokenCount: 10,
					},
				},
			}),
			"session-1",
			"/repo",
		);
		expect(entry).toMatchObject({
			agent: "agy",
			model: "gemini-3.1-pro",
			uncachedInput: 75,
			cachedInput: 25,
			output: 30,
			reasoningOutput: 10,
		});
	});
});

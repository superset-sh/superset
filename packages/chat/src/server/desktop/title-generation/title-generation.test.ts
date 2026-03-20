import { describe, expect, it, mock } from "bun:test";

const streamTextMock = mock(() => ({
	text: Promise.resolve("  Checking In  "),
}));

mock.module("ai", () => ({
	streamText: streamTextMock,
}));

const { generateTitleFromMessageWithStreamingModel } = await import(
	"./title-generation"
);

describe("generateTitleFromMessageWithStreamingModel", () => {
	it("streams a title with Codex-compatible provider options", async () => {
		const title = await generateTitleFromMessageWithStreamingModel({
			message: "  hey boss how are you  ",
			model: { id: "test-model" } as never,
			instructions: "You generate concise workspace titles.",
		});

		expect(title).toBe("Checking In");
		expect(streamTextMock).toHaveBeenCalledWith({
			model: { id: "test-model" },
			system: "You generate concise workspace titles.",
			prompt:
				"Return only a short title for this user message:\nhey boss how are you",
			providerOptions: {
				openai: {
					instructions: "You generate concise workspace titles.",
					store: false,
				},
			},
		});
	});
});

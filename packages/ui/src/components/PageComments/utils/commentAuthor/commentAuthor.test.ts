import { describe, expect, it } from "bun:test";
import { AGENT_DISPLAY_NAME, commentAuthor } from "./commentAuthor";

describe("commentAuthor", () => {
	it("shows the person who wrote a human comment", () => {
		expect(
			commentAuthor({
				authorKind: "human",
				authorName: "Sarah",
				authorImage: "https://example.test/sarah.png",
			}),
		).toEqual({
			name: "Sarah",
			image: "https://example.test/sarah.png",
			isAgent: false,
		});
	});

	it("does not attribute an agent reply to the credential's owner", () => {
		expect(
			commentAuthor({
				authorKind: "agent",
				authorName: "Harshith",
				authorImage: "https://example.test/harshith.png",
			}),
		).toEqual({ name: AGENT_DISPLAY_NAME, image: null, isAgent: true });
	});

	it("drops the human avatar on an agent reply", () => {
		expect(
			commentAuthor({
				authorKind: "agent",
				authorName: "Harshith",
				authorImage: "https://example.test/harshith.png",
			}).image,
		).toBeNull();
	});
});

import { describe, expect, it } from "bun:test";
import { getUserMessageDraft } from "./getUserMessageDraft";

function createMessage(
	content: Array<Record<string, unknown>>,
): Parameters<typeof getUserMessageDraft>[0] {
	return {
		id: "message-1",
		role: "user",
		content,
		createdAt: new Date("2026-03-06T00:00:00.000Z"),
	} as Parameters<typeof getUserMessageDraft>[0];
}

describe("getUserMessageDraft", () => {
	it("collects text across multiple text parts", () => {
		const message = createMessage([
			{ type: "text", text: "First line" },
			{ type: "text", text: "Second line" },
		]);

		expect(getUserMessageDraft(message)).toEqual({
			text: "First line\nSecond line",
			files: [],
		});
	});

	it("converts files and inline images into prompt-input files", () => {
		const message = createMessage([
			{ type: "text", text: "Review this" },
			{
				type: "file",
				data: "https://example.com/spec.pdf",
				mediaType: "application/pdf",
				filename: "spec.pdf",
			},
			{
				type: "image",
				data: "ZmFrZQ==",
				mimeType: "image/png",
			},
		]);

		expect(getUserMessageDraft(message)).toEqual({
			text: "Review this",
			files: [
				{
					type: "file",
					url: "https://example.com/spec.pdf",
					mediaType: "application/pdf",
					filename: "spec.pdf",
				},
				{
					type: "file",
					url: "data:image/png;base64,ZmFrZQ==",
					mediaType: "image/png",
					filename: undefined,
				},
			],
		});
	});
});

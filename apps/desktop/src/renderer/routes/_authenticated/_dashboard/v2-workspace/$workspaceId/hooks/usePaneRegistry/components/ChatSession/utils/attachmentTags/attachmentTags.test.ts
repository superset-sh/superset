import { describe, expect, it } from "bun:test";
import { formatAttachmentTag, parseAttachmentTags } from "./attachmentTags";

describe("attachmentTags", () => {
	it("round-trips tags appended to a message and strips them from the text", () => {
		const message = [
			"look at these",
			formatAttachmentTag({
				path: ".superset/attachments/shot.png",
				type: "image/png",
			}),
			formatAttachmentTag({
				path: ".superset/attachments/notes.txt",
				type: 'text/plain" onerror="x',
			}),
		].join("\n");

		expect(parseAttachmentTags(message)).toEqual({
			text: "look at these",
			attachments: [
				{ path: ".superset/attachments/shot.png", type: "image/png" },
				{ path: ".superset/attachments/notes.txt", type: "" },
			],
		});
	});

	it("leaves tags that point outside the workspace attachments folder as plain text", () => {
		const message = [
			'<attachment path=".superset/attachments/../../../etc/passwd" type="image/png" />',
			'<attachment path="/etc/hosts" type="image/png" />',
			'<attachment path=".superset/attachments/.." type="image/png" />',
		].join("\n");

		expect(parseAttachmentTags(message)).toEqual({
			text: message,
			attachments: [],
		});
	});
});

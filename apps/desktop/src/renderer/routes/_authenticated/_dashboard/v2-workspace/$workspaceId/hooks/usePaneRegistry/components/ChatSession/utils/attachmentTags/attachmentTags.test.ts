import { describe, expect, it } from "bun:test";
import { formatAttachmentTag, parseAttachmentTags } from "./attachmentTags";

/** The trailing-block format older builds sent; parsing it still has to work. */
function legacyPastedMessage(
	prompt: string,
	pastes: readonly string[],
): string {
	const blocks = pastes.map(
		(paste) =>
			`<pasted_text lines="${paste.split("\n").length}">\n${paste}\n</pasted_text>`,
	);
	return [prompt, ...blocks].filter(Boolean).join("\n\n");
}

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
			pastedTexts: [],
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
			pastedTexts: [],
		});
	});

	it("takes trailing pasted text off first, so a tag inside a paste stays in it", () => {
		const tag = formatAttachmentTag({
			path: ".superset/attachments/shot.png",
			type: "image/png",
		});
		const paste = `log line\n${tag}`;
		const message = legacyPastedMessage(`look\n${tag}`, [paste]);

		expect(parseAttachmentTags(message)).toEqual({
			text: "look",
			attachments: [
				{ path: ".superset/attachments/shot.png", type: "image/png" },
			],
			pastedTexts: [paste],
		});
	});
});

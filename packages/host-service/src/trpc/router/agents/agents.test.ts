import { describe, expect, it } from "bun:test";
import { buildAttachmentBlock } from "./attachment-prompt";

describe("buildAttachmentBlock", () => {
	it("keeps the complete prompt and every resolved attachment path", () => {
		const prompt = `${"large prompt 🎉\n".repeat(4096)}tail\n`;
		const attachments = Array.from({ length: 300 }, (_, index) => ({
			attachmentId: `attachment-${index}`,
			path: `/tmp/attached files/trace-${index}-中文.log`,
		}));

		const result = buildAttachmentBlock(prompt, attachments);

		expect(result.startsWith(prompt)).toBe(true);
		expect(result).toContain("# Attached files");
		expect(result).toContain("/tmp/attached files/trace-0-中文.log");
		expect(result).toEndWith("- /tmp/attached files/trace-299-中文.log");
	});

	it("does not alter prompts without attachments", () => {
		expect(buildAttachmentBlock("prompt\n", [])).toBe("prompt\n");
	});
});

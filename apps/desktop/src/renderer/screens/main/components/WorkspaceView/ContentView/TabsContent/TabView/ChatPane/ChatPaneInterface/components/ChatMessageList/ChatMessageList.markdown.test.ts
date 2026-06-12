import { describe, expect, test } from "bun:test";
import { STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME } from "./ChatMessageList.markdown";

describe("STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME", () => {
	test("keeps newline-heavy classification paragraphs readable", () => {
		expect(STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME).toContain(
			"[&_p:has(br)]:leading-[1.8]",
		);
		expect(STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME).toContain(
			"[&_p:has(br)>br]:mb-1",
		);
	});

	test("keeps list items compact without collapsing them", () => {
		expect(STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME).toContain("[&_li]:my-1");
		expect(STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME).toContain(
			"[&_li]:!whitespace-normal",
		);
		expect(STANDALONE_ASSISTANT_MARKDOWN_CLASSNAME).toContain(
			"[&_li>p]:!whitespace-normal",
		);
	});
});

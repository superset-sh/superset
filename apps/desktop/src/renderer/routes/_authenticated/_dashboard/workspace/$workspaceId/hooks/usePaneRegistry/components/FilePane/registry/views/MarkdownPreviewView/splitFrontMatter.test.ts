import { describe, expect, it } from "bun:test";
import { splitFrontMatter } from "./splitFrontMatter";

describe("splitFrontMatter", () => {
	it("splits a standard front-matter block verbatim", () => {
		const text = "---\ntitle: hello\ntags: [a, b]\n---\n\n# Doc\n";
		expect(splitFrontMatter(text)).toEqual({
			frontMatter: "---\ntitle: hello\ntags: [a, b]\n---\n",
			body: "\n# Doc\n",
		});
	});

	it("supports the `...` closing delimiter and CRLF", () => {
		const text = "---\r\ntitle: x\r\n...\r\nBody.\r\n";
		expect(splitFrontMatter(text).frontMatter).toBe(
			"---\r\ntitle: x\r\n...\r\n",
		);
		expect(splitFrontMatter(text).body).toBe("Body.\r\n");
	});

	it("does not match when the file does not start with ---", () => {
		const text = "# Doc\n\n---\ntitle: nope\n---\n";
		expect(splitFrontMatter(text)).toEqual({ frontMatter: "", body: text });
	});

	it("does not match hr-delimited documents (blank line inside)", () => {
		const text = "---\n\nSlide one\n\n---\n\nSlide two\n";
		expect(splitFrontMatter(text)).toEqual({ frontMatter: "", body: text });
	});

	it("does not match an unclosed block", () => {
		const text = "---\ntitle: x\nnothing closes\n";
		expect(splitFrontMatter(text)).toEqual({ frontMatter: "", body: text });
	});

	it("handles a block closing at EOF without trailing newline", () => {
		const text = "---\ntitle: x\n---";
		expect(splitFrontMatter(text)).toEqual({
			frontMatter: "---\ntitle: x\n---",
			body: "",
		});
	});

	it("leaves an empty file alone", () => {
		expect(splitFrontMatter("")).toEqual({ frontMatter: "", body: "" });
	});
});

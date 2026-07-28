import { describe, expect, it } from "bun:test";
import type { BundledLanguage } from "shiki";
import { highlightCode } from "./code-block";

describe("highlightCode", () => {
	// biome-ignore lint/suspicious/noExplicitAny: HAST tree structure is recursive and untyped
	const extractText = (node: any): string => {
		if (node.type === "text") return node.value;
		if (node.children) {
			return node.children.map(extractText).join("");
		}
		return "";
	};

	it("preserves whitespace in highlighted plain text", async () => {
		const codeWithWhitespace = `Line 1      has    multiple   spaces
  Line 2 is indented with 2 spaces
    Line 3 is indented with 4 spaces`;

		const [light, dark] = await highlightCode(
			codeWithWhitespace,
			"text" as BundledLanguage,
			false,
		);

		const lightText = extractText(light);
		const darkText = extractText(dark);

		expect(lightText).toBe(codeWithWhitespace);
		expect(darkText).toBe(codeWithWhitespace);
	});

	it("preserves whitespace in highlighted JavaScript code", async () => {
		const jsCode = `function test() {
    const x    =     1;  // multiple spaces
      const y  = 2;      // extra indent
}`;

		const [light, dark] = await highlightCode(
			jsCode,
			"javascript" as BundledLanguage,
			false,
		);

		const lightText = extractText(light);
		const darkText = extractText(dark);

		expect(lightText).toBe(jsCode);
		expect(darkText).toBe(jsCode);
	});

	it("preserves whitespace with line numbers enabled", async () => {
		const code = `  indented
    more indent`;

		const [light, dark] = await highlightCode(
			code,
			"text" as BundledLanguage,
			true,
			1,
		);

		// biome-ignore lint/suspicious/noExplicitAny: HAST tree structure is recursive and untyped
		const extractCodeText = (node: any): string => {
			if (node.type === "text") {
				return node.value;
			}
			if (node.type === "element" && node.properties?.className) {
				// Skip line number elements (they have className shiki-line-number)
				const classes = node.properties.className;
				if (Array.isArray(classes) && classes.includes("shiki-line-number")) {
					return "";
				}
			}
			if (node.children) {
				return node.children.map(extractCodeText).join("");
			}
			return "";
		};

		const lightText = extractCodeText(light);
		const darkText = extractCodeText(dark);

		expect(lightText).toContain("  indented");
		expect(lightText).toContain("    more indent");
		expect(darkText).toContain("  indented");
		expect(darkText).toContain("    more indent");
	});
});

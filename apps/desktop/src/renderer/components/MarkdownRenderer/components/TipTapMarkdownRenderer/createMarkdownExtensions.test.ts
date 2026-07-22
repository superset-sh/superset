import { describe, expect, it } from "bun:test";
import { createMarkdownExtensions } from "./createMarkdownExtensions";

describe("createMarkdownExtensions", () => {
	it("configures read-only CodeBlock with whitespace: 'pre'", () => {
		const onSaveRef = { current: undefined };

		const extensions = createMarkdownExtensions({
			editable: false,
			onSaveRef,
		});

		const codeBlock = extensions.find((ext) => ext.name === "codeBlock");
		expect(codeBlock).toBeDefined();
		expect((codeBlock?.config as { whitespace?: string }).whitespace).toBe(
			"pre",
		);
	});

	it("configures editable CodeBlock with whitespace: 'pre'", () => {
		const onSaveRef = { current: undefined };

		const extensions = createMarkdownExtensions({
			editable: true,
			onSaveRef,
		});

		const codeBlock = extensions.find((ext) => ext.name === "codeBlock");
		expect(codeBlock).toBeDefined();
		expect((codeBlock?.config as { whitespace?: string }).whitespace).toBe(
			"pre",
		);
	});
});

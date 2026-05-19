import { describe, expect, it } from "bun:test";
import type { MutableRefObject } from "react";
import { createMarkdownExtensions } from "./createMarkdownExtensions";

interface LinkOptions {
	openOnClick: boolean | string;
}

function findLinkExtension(
	extensions: ReturnType<typeof createMarkdownExtensions>,
) {
	return extensions.find((ext) => ext.name === "link") as
		| { name: string; options: LinkOptions }
		| undefined;
}

describe("createMarkdownExtensions", () => {
	const onSaveRef: MutableRefObject<(() => void) | undefined> = {
		current: undefined,
	};

	it("opens links on click when the rendered markdown view is editable (#4156)", () => {
		const extensions = createMarkdownExtensions({
			editable: true,
			onSaveRef,
		});

		const link = findLinkExtension(extensions);
		expect(link).toBeDefined();
		expect(link?.options.openOnClick).toBe(true);
	});

	it("opens links on click in read-only mode", () => {
		const extensions = createMarkdownExtensions({
			editable: false,
			onSaveRef,
		});

		const link = findLinkExtension(extensions);
		expect(link).toBeDefined();
		expect(link?.options.openOnClick).toBe(true);
	});
});

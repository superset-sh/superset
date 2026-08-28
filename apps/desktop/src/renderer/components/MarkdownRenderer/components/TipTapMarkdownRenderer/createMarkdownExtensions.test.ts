import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — TipTap's Editor needs
// real DOM APIs. bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so register once and unregister after.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { createMarkdownExtensions } = await import("./createMarkdownExtensions");

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function getMarkdown(editor: InstanceType<typeof Editor>): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	return storage.markdown?.getMarkdown?.() ?? "";
}

function createEditor(content: string) {
	return new Editor({
		editable: true,
		extensions: createMarkdownExtensions({
			editable: true,
			onSaveRef: { current: undefined },
		}),
		content,
	});
}

function roundTrip(markdown: string): string {
	const editor = createEditor(markdown);
	try {
		return getMarkdown(editor);
	} finally {
		editor.destroy();
	}
}

describe("image attribute parsing", () => {
	// @tiptap/core's default attribute parser (fromString) coerces
	// numeric/boolean-looking strings, so ![123](x.png) used to load as
	// alt: 123 (number) and the markdown serializer threw
	// "str.replace is not a function" on every render (DESKTOP-100).
	it("keeps a numeric alt as a string and serializes it", () => {
		const editor = createEditor("![123](https://example.com/img.png)");
		try {
			const image = editor.state.doc.firstChild;
			expect(image?.type.name).toBe("image");
			expect(image?.attrs.alt).toBe("123");
			expect(getMarkdown(editor)).toBe("![123](https://example.com/img.png)");
		} finally {
			editor.destroy();
		}
	});

	it("keeps a boolean-looking alt as a string", () => {
		const editor = createEditor("![true](https://example.com/img.png)");
		try {
			expect(editor.state.doc.firstChild?.attrs.alt).toBe("true");
			expect(getMarkdown(editor)).toBe("![true](https://example.com/img.png)");
		} finally {
			editor.destroy();
		}
	});

	it("keeps a numeric title as a string and serializes it", () => {
		expect(roundTrip('![photo](https://example.com/img.png "2024")')).toBe(
			'![photo](https://example.com/img.png "2024")',
		);
	});

	it("keeps a numeric src as a string and serializes it", () => {
		expect(roundTrip("![photo](123)")).toBe("![photo](123)");
	});

	it("round-trips an ordinary image unchanged", () => {
		expect(roundTrip("![photo](https://example.com/img.png)")).toBe(
			"![photo](https://example.com/img.png)",
		);
	});
});

describe("table rendering", () => {
	it("wraps tables in a dedicated horizontal scroll container", () => {
		const editor = createEditor("| Name | Value |\n| --- | --- |\n| A | B |");
		try {
			const element = document.createElement("div");
			element.innerHTML = editor.getHTML();
			const wrapper = element.querySelector(".tableWrapper");

			expect(wrapper).not.toBeNull();
			expect(wrapper?.firstElementChild?.tagName).toBe("TABLE");
		} finally {
			editor.destroy();
		}
	});
});

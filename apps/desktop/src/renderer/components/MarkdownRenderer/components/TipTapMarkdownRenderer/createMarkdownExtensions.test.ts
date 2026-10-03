import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — TipTap's Editor needs
// real DOM APIs. bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so register once and unregister after.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it, spyOn } = await import("bun:test");
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

function mathNodes(editor: InstanceType<typeof Editor>) {
	const found: { type: string; latex: string }[] = [];
	editor.state.doc.descendants((node) => {
		if (node.type.name === "inlineMath" || node.type.name === "blockMath") {
			found.push({ type: node.type.name, latex: node.attrs.latex });
		}
		return true;
	});
	return found;
}

describe("preview links", () => {
	it.each([
		true,
		false,
	])("never opens a link itself when editable is %p", (editable) => {
		const editor = new Editor({
			editable,
			extensions: createMarkdownExtensions({
				editable,
				onSaveRef: { current: undefined },
			}),
			content: "[**Example**](https://example.com/)",
		});
		const open = spyOn(window, "open").mockReturnValue(null);
		try {
			const event = new MouseEvent("click", { button: 0 });
			Object.defineProperty(event, "target", {
				value: editor.view.dom.querySelector("strong"),
			});

			const handled = editor.view.someProp("handleClick", (handler) =>
				handler(editor.view, 1, event),
			);

			expect(handled).toBeFalsy();
			expect(open).not.toHaveBeenCalled();
		} finally {
			open.mockRestore();
			editor.destroy();
		}
	});
});

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

describe("math", () => {
	it("reads $...$ as inline math and writes it back", () => {
		const editor = createEditor("Euler: $e^{i\\pi} + 1 = 0$.");
		try {
			expect(mathNodes(editor)).toEqual([
				{ type: "inlineMath", latex: "e^{i\\pi} + 1 = 0" },
			]);
		} finally {
			editor.destroy();
		}
		expect(roundTrip("Euler: $e^{i\\pi} + 1 = 0$.")).toBe(
			"Euler: $e^{i\\pi} + 1 = 0$.",
		);
	});

	it("reads $$...$$ as block math and writes it back", () => {
		const editor = createEditor("$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$");
		try {
			expect(mathNodes(editor)).toEqual([
				{ type: "blockMath", latex: "\\int_0^1 x\\,dx = \\frac{1}{2}" },
			]);
		} finally {
			editor.destroy();
		}
		expect(roundTrip("$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$")).toBe(
			"$$\n\\int_0^1 x\\,dx = \\frac{1}{2}\n$$",
		);
	});

	it("leaves currency alone", () => {
		const editor = createEditor("It costs $5 and $10 today.");
		try {
			expect(mathNodes(editor)).toEqual([]);
		} finally {
			editor.destroy();
		}
		expect(roundTrip("It costs $5 and $10 today.")).toBe(
			"It costs $5 and $10 today.",
		);
	});

	it("leaves a currency range alone", () => {
		const editor = createEditor("Costs $5-$10 today.");
		try {
			expect(mathNodes(editor)).toEqual([]);
		} finally {
			editor.destroy();
		}
		expect(roundTrip("Costs $5-$10 today.")).toBe("Costs $5-$10 today.");
	});

	it("keeps the text after a same-line display delimiter", () => {
		const editor = createEditor("$$x$$ and text");
		try {
			expect(editor.state.doc.textContent).toContain("and text");
		} finally {
			editor.destroy();
		}
		expect(roundTrip("$$x$$ and text")).toBe("$$x$$ and text");
	});

	it("keeps the text after a later-line display delimiter", () => {
		const markdown = "$$\nx\n$$ and text";
		const editor = createEditor(markdown);
		try {
			expect(mathNodes(editor)).toEqual([]);
		} finally {
			editor.destroy();
		}
		// The trailing words used to be consumed with the closing line. Soft
		// breaks in a paragraph collapse to spaces on the way out, so the pin
		// is that the words survive, not the exact bytes.
		expect(roundTrip(markdown)).toBe("$$ x $$ and text");
	});

	it("mounts the math node views instead of the raw delimiters", () => {
		// KaTeX's own rendering is left to the extension, whose node views
		// depend on happy-dom globals another test file may have registered
		// first, so only the wiring is pinned here.
		const editor = createEditor("$x^2$ and\n\n$$\n\\frac{1}{2}\n$$");
		try {
			const dom = editor.view.dom;
			expect(dom.querySelectorAll('[data-type="inline-math"]').length).toBe(1);
			expect(dom.querySelectorAll('[data-type="block-math"]').length).toBe(1);
			expect(dom.textContent ?? "").not.toContain("$");
		} finally {
			editor.destroy();
		}
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

describe("link attribute parsing", () => {
	// Same coercion as the image attributes above, on the link mark's title:
	// pasting <a href="..." title="2024"> loaded title: 2024 (number) and
	// prosemirror-markdown's link serializer threw on .replace (DESKTOP-1A6).
	it("keeps a numeric link title as a string and serializes it", () => {
		const editor = createEditor('[docs](https://example.com "2024")');
		try {
			const link = editor.state.doc.firstChild?.firstChild?.marks[0];
			expect(link?.type.name).toBe("link");
			expect(link?.attrs.title).toBe("2024");
			expect(getMarkdown(editor)).toBe('[docs](https://example.com "2024")');
		} finally {
			editor.destroy();
		}
	});

	it("keeps a boolean-looking link title as a string", () => {
		expect(roundTrip('[docs](https://example.com "true")')).toBe(
			'[docs](https://example.com "true")',
		);
	});

	it("round-trips a link without a title unchanged", () => {
		expect(roundTrip("[docs](https://example.com)")).toBe(
			"[docs](https://example.com)",
		);
	});
});

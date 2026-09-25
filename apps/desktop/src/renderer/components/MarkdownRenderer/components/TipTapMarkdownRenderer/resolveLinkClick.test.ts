import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { afterAll, describe, expect, it } = await import("bun:test");
const { Editor } = await import("@tiptap/core");
const { tierFor } = await import("renderer/lib/clickPolicy/tiers");
const { createMarkdownExtensions } = await import("./createMarkdownExtensions");
const { resolveLinkClick } = await import("./resolveLinkClick");

type LinkTierMap = import("renderer/lib/clickPolicy").LinkTierMap;
type ModifierEvent = import("renderer/lib/clickPolicy").ModifierEvent;

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const DEFAULT_URL_LINKS: LinkTierMap = {
	plain: null,
	shift: "newTab",
	meta: "pane",
	metaShift: "external",
};

const FIXTURE = [
	"[**web**](https://example.com/a)",
	"[mail](mailto:a@b.c)",
	"[file](file:///etc/passwd)",
	"[js](javascript:alert(1))",
	"[vscode](vscode://file/x)",
	"[relative](./other.md)",
	"[anchor](#heading)",
	"plain text",
].join("\n\n");

function fourTier(map: LinkTierMap) {
	return (event: ModifierEvent) => map[tierFor(event, "4-tier")];
}

function click(
	selector: string,
	modifiers: Partial<ModifierEvent> & { button?: number },
	map: LinkTierMap = DEFAULT_URL_LINKS,
) {
	const editor = new Editor({
		editable: true,
		extensions: createMarkdownExtensions({
			editable: true,
			onSaveRef: { current: undefined },
		}),
		content: FIXTURE,
	});
	try {
		const target = editor.view.dom.querySelector(selector);
		expect(target).not.toBeNull();
		return resolveLinkClick(
			{
				button: 0,
				metaKey: false,
				ctrlKey: false,
				shiftKey: false,
				...modifiers,
				target,
			},
			fourTier(map),
		);
	} finally {
		editor.destroy();
	}
}

describe("resolveLinkClick", () => {
	it("leaves a plain click unbound so the caret can land in the link", () => {
		expect(click("a[href^='https'] strong", {})).toEqual({ kind: "unbound" });
	});

	it.each([
		[{ shiftKey: true }, "newTab"],
		[{ metaKey: true }, "pane"],
		[{ ctrlKey: true }, "pane"],
		[{ metaKey: true, shiftKey: true }, "external"],
	] as const)("maps %p to %s", (modifiers, action) => {
		expect(click("a[href^='https'] strong", modifiers)).toEqual({
			kind: "open",
			url: "https://example.com/a",
			action,
		});
	});

	it("follows a custom tier map", () => {
		const map: LinkTierMap = {
			plain: "external",
			shift: null,
			meta: "newTab",
			metaShift: "pane",
		};
		expect(click("a[href^='https']", {}, map)).toMatchObject({
			action: "external",
		});
		expect(click("a[href^='https']", { shiftKey: true }, map)).toEqual({
			kind: "unbound",
		});
		expect(click("a[href^='https']", { metaKey: true }, map)).toMatchObject({
			action: "newTab",
		});
	});

	it.each([
		"a[href^='mailto']",
		"a[href^='./']",
		"a[href^='#']",
	])("ignores the non-web link %s on every tier", (selector) => {
		for (const modifiers of [
			{},
			{ shiftKey: true },
			{ metaKey: true },
			{ metaKey: true, shiftKey: true },
		]) {
			expect(click(selector, modifiers)).toEqual({ kind: "none" });
		}
	});

	it("never renders file, javascript or custom-scheme links as anchors", () => {
		const editor = new Editor({
			extensions: createMarkdownExtensions({
				editable: true,
				onSaveRef: { current: undefined },
			}),
			content: FIXTURE,
		});
		try {
			const hrefs = [...editor.view.dom.querySelectorAll("a")].map((a) =>
				a.getAttribute("href"),
			);
			expect(hrefs).toEqual([
				"https://example.com/a",
				"mailto:a@b.c",
				"./other.md",
				"#heading",
			]);
		} finally {
			editor.destroy();
		}
	});

	it("ignores right-clicks and clicks outside a link", () => {
		expect(click("a[href^='https']", { button: 2, metaKey: true })).toEqual({
			kind: "none",
		});
		expect(click("p:last-child", { metaKey: true })).toEqual({ kind: "none" });
	});
});

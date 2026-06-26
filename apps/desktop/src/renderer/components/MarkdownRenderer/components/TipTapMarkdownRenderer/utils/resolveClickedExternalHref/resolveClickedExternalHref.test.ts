import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test file needs fs/path for source verification
import { join } from "node:path";
import { resolveClickedExternalHref } from "./resolveClickedExternalHref";

type AnchorLike = {
	tagName?: string;
	getAttribute?: (name: string) => string | null;
	parentNode?: AnchorLike | null;
};

function makeAnchor(href: string | null, parentNode: AnchorLike | null = null) {
	return {
		tagName: "A",
		getAttribute: (name: string) => (name === "href" ? href : null),
		parentNode,
	};
}

function makeSpan(parentNode: AnchorLike | null = null) {
	return {
		tagName: "SPAN",
		getAttribute: () => null,
		parentNode,
	};
}

const TIPTAP_RENDERER_DIR = join(__dirname, "..", "..");

function readRendererSource(fileName: string): string {
	return readFileSync(join(TIPTAP_RENDERER_DIR, fileName), "utf-8");
}

describe("resolveClickedExternalHref", () => {
	test("returns the href when the target is an anchor with an http URL", () => {
		const target = makeAnchor("http://example.com");
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			"http://example.com",
		);
	});

	test("returns the href when the target is an anchor with an https URL", () => {
		const target = makeAnchor("https://example.com/path");
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			"https://example.com/path",
		);
	});

	test("walks up parent nodes to find the anchor", () => {
		const anchor = makeAnchor("https://example.com");
		const inner = makeSpan(anchor);
		const target = makeSpan(inner);
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			"https://example.com",
		);
	});

	test("returns null when no anchor is in the ancestor chain", () => {
		const target = makeSpan(makeSpan(null));
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			null,
		);
	});

	test("returns null when the anchor href is not http/https", () => {
		const target = makeAnchor("mailto:someone@example.com");
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			null,
		);
	});

	test("returns null when the anchor has no href", () => {
		const target = makeAnchor(null);
		expect(resolveClickedExternalHref(target as unknown as EventTarget)).toBe(
			null,
		);
	});

	test("returns null when target is null", () => {
		expect(resolveClickedExternalHref(null)).toBe(null);
	});
});

describe("TipTapMarkdownRenderer link click wiring (#3644)", () => {
	test("TipTap Link extension does not rely on openOnClick in preview mode", () => {
		const source = readRendererSource("createMarkdownExtensions.ts");
		expect(source).toContain("openOnClick: false");
		expect(source).not.toContain("openOnClick: !editable");
	});

	test("TipTapMarkdownRenderer intercepts clicks on links to open them externally", () => {
		const source = readRendererSource("TipTapMarkdownRenderer.tsx");
		expect(source).toContain("resolveClickedExternalHref");
		expect(source).toContain("external.openUrl");
		expect(source).toContain("handleClick");
	});
});

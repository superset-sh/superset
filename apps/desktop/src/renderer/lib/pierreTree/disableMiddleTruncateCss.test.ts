import { describe, expect, it } from "bun:test";
import { DISABLE_MIDDLE_TRUNCATE_CSS } from "./disableMiddleTruncateCss";

/**
 * Mirrors `splitExtension` from `@pierre/trees`' bundled
 * `dist/components/OverflowText.js`. Reproduced here so we can prove that the
 * names reported in issue #4619 trigger Pierre's MiddleTruncate split — the
 * upstream helper isn't a public export, so we can't import it directly.
 */
function pierreSplitExtension(contents: string): [string, string] {
	if (contents.length < 4) return [contents, ""];
	const extensionIndex = contents.lastIndexOf(".") + 1;
	const isTooLong = contents.length - extensionIndex > 10;
	const splitIndex =
		extensionIndex >= 1 && !isTooLong
			? extensionIndex
			: Math.ceil(contents.length / 2);
	return [contents.slice(0, splitIndex), contents.slice(splitIndex)];
}

const PIERRE_MIN_TRUNCATE_LENGTH = 5;

function isMiddleTruncatedByPierre(name: string): boolean {
	return name.length >= PIERRE_MIN_TRUNCATE_LENGTH;
}

describe("issue #4619: file explorer middle-truncates short names", () => {
	const REPORTED_NAMES = [
		".agents",
		".claude",
		".codex",
		"node_modules",
		"package.json",
		"PLANNING.md",
	];

	it("Pierre splits each reported name into two halves it can truncate separately", () => {
		const splits = Object.fromEntries(
			REPORTED_NAMES.map((name) => [name, pierreSplitExtension(name)]),
		);
		expect(splits).toEqual({
			".agents": [".", "agents"],
			".claude": [".", "claude"],
			".codex": [".", "codex"],
			node_modules: ["node_m", "odules"],
			"package.json": ["package.", "json"],
			"PLANNING.md": ["PLANNING.", "md"],
		});
		for (const name of REPORTED_NAMES) {
			expect(isMiddleTruncatedByPierre(name)).toBe(true);
		}
	});
});

describe("DISABLE_MIDDLE_TRUNCATE_CSS", () => {
	it("scopes every rule to Pierre's content lane to avoid leaking outside the tree", () => {
		const rules = DISABLE_MIDDLE_TRUNCATE_CSS.split("}")
			.map((rule) => rule.trim())
			.filter((rule) => rule.length > 0);
		expect(rules.length).toBeGreaterThan(0);
		for (const rule of rules) {
			expect(rule).toContain("[data-item-section='content']");
		}
	});

	it("hides Pierre's middle-truncate marker, overflow, and fill cells", () => {
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toContain(
			"[data-truncate-marker-cell]",
		);
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toContain(
			"[data-truncate-content='overflow']",
		);
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toContain("[data-truncate-fill]");
		const hideBlock = DISABLE_MIDDLE_TRUNCATE_CSS.match(
			/\[data-truncate-marker-cell\][^}]*\{[^}]*\}/,
		);
		expect(hideBlock?.[0]).toMatch(/display:\s*none/);
	});

	it("flattens the middle-truncate split grid back to inline flow", () => {
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toContain(
			"[data-truncate-group-container='middle']",
		);
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toMatch(/display:\s*inline/);
	});

	it("restores LTR direction for the right-hand `fruncate` segment so names read normally", () => {
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toContain(
			"[data-truncate-container='fruncate']",
		);
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toMatch(/direction:\s*ltr/);
	});

	it("forces the content lane to nowrap so the parent text-overflow can end-truncate", () => {
		expect(DISABLE_MIDDLE_TRUNCATE_CSS).toMatch(/white-space:\s*nowrap/);
	});
});

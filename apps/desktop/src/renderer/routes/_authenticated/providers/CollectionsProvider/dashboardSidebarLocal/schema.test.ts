import { describe, expect, it } from "bun:test";
import { DEFAULT_V2_USER_PREFERENCES, healV2UserPreferences } from "./schema";

describe("healV2UserPreferences", () => {
	it("returns full defaults for empty/non-object input", () => {
		expect(healV2UserPreferences({})).toEqual(DEFAULT_V2_USER_PREFERENCES);
		expect(healV2UserPreferences(null)).toEqual(DEFAULT_V2_USER_PREFERENCES);
		expect(healV2UserPreferences(undefined)).toEqual(
			DEFAULT_V2_USER_PREFERENCES,
		);
	});

	it("preserves stored top-level fields and fills missing ones", () => {
		const stored = { rightSidebarOpen: false, rightSidebarWidth: 500 };
		const healed = healV2UserPreferences(stored);
		expect(healed.rightSidebarOpen).toBe(false);
		expect(healed.rightSidebarWidth).toBe(500);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		expect(healed.fileLinks).toEqual(DEFAULT_V2_USER_PREFERENCES.fileLinks);
	});

	it("reproduces the original crash shape: missing sidebarFileLinks entirely", () => {
		// Shape of rows persisted before sidebarFileLinks was added in e8067e196.
		const stored = {
			id: "preferences",
			fileLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			urlLinks: { plain: null, shift: null, meta: "pane", metaShift: null },
			rightSidebarOpen: true,
			rightSidebarTab: "changes",
			rightSidebarWidth: 340,
			deleteLocalBranch: false,
		};
		const healed = healV2UserPreferences(stored);
		expect(healed.sidebarFileLinks).toEqual(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks,
		);
		// Every tier defined — the property buildHint reads.
		expect(healed.sidebarFileLinks.shift).toBeDefined();
	});

	it("fills missing tiers inside an otherwise-present tier map", () => {
		// Hypothetical future shape: sidebarFileLinks exists but a tier was added
		// to the schema after this row was written.
		const stored = {
			sidebarFileLinks: { plain: "pane", meta: "external" },
		};
		const healed = healV2UserPreferences(stored);
		expect(healed.sidebarFileLinks.plain).toBe("pane");
		expect(healed.sidebarFileLinks.meta).toBe("external");
		// Tiers absent from the stored row fall back to defaults.
		expect(healed.sidebarFileLinks.shift).toBe(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks.shift,
		);
		expect(healed.sidebarFileLinks.metaShift).toBe(
			DEFAULT_V2_USER_PREFERENCES.sidebarFileLinks.metaShift,
		);
	});
});

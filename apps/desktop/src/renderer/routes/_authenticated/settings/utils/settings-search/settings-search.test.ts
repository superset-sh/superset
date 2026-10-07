import { describe, expect, it } from "bun:test";
import {
	getAllowedSectionsForVariant,
	getVisibleItemsForSection,
	getVisibleMatchCountBySection,
	SETTING_ITEM_ID,
	type SettingsItem,
	searchSettings,
} from "./settings-search";

function getIds(items: SettingsItem[]): string[] {
	return items.map((item) => item.id);
}

describe("settings search - font settings", () => {
	it('searching "font" returns both APPEARANCE_EDITOR_FONT and APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "terminal font" returns APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("terminal font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "editor" returns APPEARANCE_EDITOR_FONT', () => {
		const results = searchSettings("editor");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it('searching "monospace" returns both font items', () => {
		const results = searchSettings("monospace");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "Editor Font" is case-insensitive', () => {
		const results = searchSettings("Editor Font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it("normalizes whitespace between search terms", () => {
		const results = searchSettings("  terminal   font  ");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("empty search returns all settings items", () => {
		const results = searchSettings("");
		expect(results.length).toBeGreaterThan(0);
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("font items have correct section", () => {
		const results = searchSettings("font");
		const editorFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		);
		const terminalFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		);

		expect(editorFont?.section).toBe("appearance");
		expect(terminalFont?.section).toBe("appearance");
	});
});

describe("settings search - hosts", () => {
	it('searching "delete host" returns the host deletion setting', () => {
		const ids = getIds(searchSettings("delete host"));

		expect(ids).toContain(SETTING_ITEM_ID.HOST_DELETE);
	});
});

describe("settings search - usage in sidebar", () => {
	it('searching "sidebar" in Usage returns the usage-in-sidebar switch for v2 users', () => {
		const ids = getVisibleItemsForSection({
			section: "usage",
			searchQuery: "sidebar",
			isV2: true,
		});
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_IN_SIDEBAR);
	});

	it("hides the usage-in-sidebar switch from v1 users", () => {
		const ids = getVisibleItemsForSection({
			section: "usage",
			searchQuery: "sidebar",
			isV2: false,
		});
		expect(ids).not.toContain(SETTING_ITEM_ID.USAGE_IN_SIDEBAR);
	});

	it('searching "shortcut" matches the usage-in-sidebar item', () => {
		const ids = getIds(searchSettings("shortcut"));
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_IN_SIDEBAR);
	});

	it("lists the usage-in-sidebar switch in Usage without a search for v2 users", () => {
		const ids = getVisibleItemsForSection({
			section: "usage",
			searchQuery: "",
			isV2: true,
		});
		expect(ids).toContain(SETTING_ITEM_ID.USAGE_IN_SIDEBAR);
	});
});

describe("settings search - auto save", () => {
	it('lists Auto Save for v2 users when searching "onFocusChange"', () => {
		const ids = getVisibleItemsForSection({
			section: "files",
			searchQuery: "onFocusChange",
			isV2: true,
		});
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_FILE_AUTO_SAVE);
	});

	it.each([
		"after delay",
		"on focus change",
		"on window change",
	])('lists Auto Save for v2 users when searching "%s"', (searchQuery) => {
		const ids = getVisibleItemsForSection({
			section: "files",
			searchQuery,
			isV2: true,
		});
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_FILE_AUTO_SAVE);
	});
});

describe("settings search - mobile rollout", () => {
	it("excludes mobile matches until the feature flag is enabled", () => {
		expect(
			getVisibleMatchCountBySection("iPhone", true, false).mobile,
		).toBeUndefined();
		expect(
			getVisibleMatchCountBySection("iPhone", true, false, true).mobile,
		).toBe(1);
		expect(
			getVisibleMatchCountBySection("iPhone", false, false, true).mobile,
		).toBe(1);
	});
});

describe("settings search - Superwhisper", () => {
	it("keeps Connections and dictation search visible without cloud workspaces", () => {
		expect(getAllowedSectionsForVariant(true, false).has("connections")).toBe(
			true,
		);
		expect(
			getVisibleMatchCountBySection("Superwhisper", true, false).connections,
		).toBe(1);
		expect(
			getVisibleMatchCountBySection("GitHub", true, false).connections,
		).toBeUndefined();
		expect(
			getVisibleItemsForSection({
				section: "connections",
				searchQuery: "",
				isV2: true,
				cloudWorkspaces: false,
			}),
		).toEqual([SETTING_ITEM_ID.CONNECTIONS_SUPERWHISPER]);
		expect(getAllowedSectionsForVariant(false, false).has("connections")).toBe(
			false,
		);
	});

	it("offers Connections without cloud workspaces only when a Mac is known", () => {
		expect(
			getAllowedSectionsForVariant(true, false, false).has("connections"),
		).toBe(false);
		expect(
			getVisibleMatchCountBySection("Superwhisper", true, false, false, false)
				.connections,
		).toBeUndefined();
		expect(
			getVisibleItemsForSection({
				section: "connections",
				searchQuery: "",
				isV2: true,
				cloudWorkspaces: true,
				macHostKnown: false,
			}),
		).toEqual([SETTING_ITEM_ID.CONNECTIONS]);
	});

	it.each([
		"Superwhisper",
		"mobile dictation",
		"transcription",
		"Mac",
	])("finds the dictation setting in Connections for %s", (searchQuery) => {
		const results = searchSettings(searchQuery);
		expect(
			results.find(
				(item) => item.id === SETTING_ITEM_ID.CONNECTIONS_SUPERWHISPER,
			)?.section,
		).toBe("connections");
		expect(
			getVisibleItemsForSection({
				section: "connections",
				searchQuery,
				isV2: true,
			}),
		).toContain(SETTING_ITEM_ID.CONNECTIONS_SUPERWHISPER);
		expect(
			getVisibleItemsForSection({
				section: "connections",
				searchQuery,
				isV2: false,
			}),
		).not.toContain(SETTING_ITEM_ID.CONNECTIONS_SUPERWHISPER);
	});
});

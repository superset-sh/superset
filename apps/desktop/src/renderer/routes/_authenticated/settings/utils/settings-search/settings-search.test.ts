import { describe, expect, it } from "bun:test";
import {
	getVisibleItemsForSection,
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

// Reproduction for issue #4454 — "[bug] Settings not Filtered for 2.0".
// The user reports toggling "Resource monitor" ON in v2 settings, but the
// resource monitor never appears anywhere they can see in v2. Their main v2
// surface (the v2 workspace view at /v2-workspace/$workspaceId) does not
// render <ResourceConsumption /> at all, so the toggle is effectively a
// no-op from that view. The registry marks BEHAVIOR_RESOURCE_MONITOR as
// "shared", which is what makes the setting visible in v2 — the variant
// either needs to be "v1" (to match the v2 workspace UX) or the v2 workspace
// view needs to render the resource monitor.
describe("settings filtering — issue #4454", () => {
	it("hides BEHAVIOR_RESOURCE_MONITOR from v2 settings", () => {
		const v2Items = getVisibleItemsForSection({
			section: "behavior",
			searchQuery: "",
			isV2: true,
		});
		expect(v2Items).not.toContain(SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR);
	});

	it("still shows BEHAVIOR_RESOURCE_MONITOR in v1 settings", () => {
		const v1Items = getVisibleItemsForSection({
			section: "behavior",
			searchQuery: "",
			isV2: false,
		});
		expect(v1Items).toContain(SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR);
	});
});

import { describe, expect, it } from "bun:test";
import {
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

describe("settings search - mouse navigation setting", () => {
	it('searching "mouse" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("mouse");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "navigation" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("navigation");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "back" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("back");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "forward" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("forward");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "buttons" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("buttons");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "button 3" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("button 3");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "thumb button" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("thumb button");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it('searching "back button" returns BEHAVIOR_MOUSE_NAVIGATION', () => {
		const results = searchSettings("back button");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION);
	});

	it("mouse navigation item has correct section and title", () => {
		const results = searchSettings("mouse");
		const mouseNav = results.find(
			(r) => r.id === SETTING_ITEM_ID.BEHAVIOR_MOUSE_NAVIGATION,
		);

		expect(mouseNav?.section).toBe("behavior");
		expect(mouseNav?.title).toBe("Mouse back/forward navigation");
		expect(mouseNav?.description).toBe(
			"Use mouse buttons 3/4 to move between workspace tabs",
		);
	});
});

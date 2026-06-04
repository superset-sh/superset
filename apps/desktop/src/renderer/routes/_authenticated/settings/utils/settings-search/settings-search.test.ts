import { describe, expect, it } from "bun:test";
import {
	isItemAllowedForVariant,
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

// Reproduces https://github.com/.../issues/5101 — "unable to remove v1 projects".
// v2 projects expose a "Delete project" action, but v1 project settings had no
// way to remove a project. The settings registry is the source of truth for the
// v1/v2 settings audit, so a discoverable, v1-available project-delete item must
// exist.
describe("settings search - project deletion (issue #5101)", () => {
	it('searching "delete project" returns a project-section item', () => {
		const results = searchSettings("delete project");
		const projectItems = results.filter((r) => r.section === "project");
		expect(projectItems.length).toBeGreaterThan(0);
	});

	it('searching "remove project" returns a project-section item', () => {
		const results = searchSettings("remove project");
		const projectItems = results.filter((r) => r.section === "project");
		expect(projectItems.length).toBeGreaterThan(0);
	});

	it("a project-delete item is available in the v1 desktop UI", () => {
		const results = searchSettings("delete project");
		const projectItems = results.filter((r) => r.section === "project");
		const availableInV1 = projectItems.some((item) =>
			isItemAllowedForVariant(item.id, false),
		);
		expect(availableInV1).toBe(true);
	});
});

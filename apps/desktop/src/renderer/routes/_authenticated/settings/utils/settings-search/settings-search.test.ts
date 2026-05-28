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

describe("settings search - voice input", () => {
	it("returnsBehaviorVoiceInputForVoiceTerms", () => {
		for (const query of ["voice", "voice control", "dictation", "Wispr"]) {
			const ids = getIds(searchSettings(query));
			expect(ids).toContain(SETTING_ITEM_ID.BEHAVIOR_VOICE_INPUT);
		}
	});

	it("returnsMicrophoneReadinessForPermissionTerms", () => {
		for (const query of ["microphone", "permission", "microphone permission"]) {
			const ids = getIds(searchSettings(query));
			expect(ids).toContain(SETTING_ITEM_ID.PERMISSIONS_MICROPHONE);
		}
	});

	it("returnsVoiceShortcutForShortcutTerms", () => {
		const ids = getIds(searchSettings("voice shortcut"));
		expect(ids).toContain(SETTING_ITEM_ID.KEYBOARD_SHORTCUTS);
	});

	it("omitsVendorCredentialSetupSearchResults", () => {
		for (const query of ["API key", "account", "SDK", "provider setup"]) {
			const results = searchSettings(query);
			const ids = getIds(results);
			expect(ids).not.toContain(SETTING_ITEM_ID.BEHAVIOR_VOICE_INPUT);
			expect(
				results.some((item) =>
					`${item.title} ${item.description} ${item.keywords.join(" ")}`
						.toLowerCase()
						.includes("wispr flow credential"),
				),
			).toBe(false);
		}
	});
});

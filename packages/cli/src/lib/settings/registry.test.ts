import { describe, expect, test } from "bun:test";
import {
	allowedValues,
	getSettingDefinition,
	parseSettingValue,
	SETTINGS,
} from "./registry";

describe("settings registry", () => {
	test("every key is unique", () => {
		const keys = SETTINGS.map((def) => def.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("unknown key throws with a hint", () => {
		expect(() => getSettingDefinition("bogus")).toThrow(/Unknown setting/);
	});

	test("the custom ringtone is not settable (needs an uploaded file)", () => {
		const def = getSettingDefinition("selectedRingtoneId");
		expect(def.enumValues).not.toContain("custom");
		expect(def.enumValues).toContain("arcade");
	});

	test("non-editor apps are excluded from defaultEditor", () => {
		const def = getSettingDefinition("defaultEditor");
		expect(def.enumValues).toContain("vscode");
		expect(def.enumValues).not.toContain("finder");
		expect(def.enumValues).not.toContain("ghostty");
	});

	describe("parseSettingValue", () => {
		test("booleans accept common spellings", () => {
			const def = getSettingDefinition("confirmOnQuit");
			expect(parseSettingValue(def, "true")).toBe(true);
			expect(parseSettingValue(def, "ON")).toBe(true);
			expect(parseSettingValue(def, "0")).toBe(false);
			expect(() => parseSettingValue(def, "maybe")).toThrow(/true or false/);
		});

		test("enums reject values outside the list", () => {
			const def = getSettingDefinition("fileOpenMode");
			expect(parseSettingValue(def, "new-tab")).toBe("new-tab");
			expect(() => parseSettingValue(def, "popup")).toThrow(/Invalid value/);
		});

		test("numbers enforce range", () => {
			const def = getSettingDefinition("notificationVolume");
			expect(parseSettingValue(def, "60")).toBe(60);
			expect(() => parseSettingValue(def, "101")).toThrow(/between/);
			expect(() => parseSettingValue(def, "1.5")).toThrow(/integer/);
			expect(() => parseSettingValue(def, "loud")).toThrow(/number/);
			expect(() => parseSettingValue(def, "")).toThrow(/number/);
			expect(() => parseSettingValue(def, "  ")).toThrow(/number/);
		});

		test("font sizes enforce half steps", () => {
			const def = getSettingDefinition("terminalFontSize");
			expect(parseSettingValue(def, "14.5")).toBe(14.5);
			expect(() => parseSettingValue(def, "14.3")).toThrow(/multiple of 0.5/);
			expect(() => parseSettingValue(def, "9")).toThrow(/between/);
		});

		test("line height tolerates tenth-step floats", () => {
			const def = getSettingDefinition("terminalLineHeight");
			expect(parseSettingValue(def, "1.3")).toBe(1.3);
			expect(() => parseSettingValue(def, "1.25")).toThrow(/multiple of 0.1/);
		});

		test("font weight must be a multiple of 100", () => {
			const def = getSettingDefinition("editorFontWeight");
			expect(parseSettingValue(def, "600")).toBe(600);
			expect(() => parseSettingValue(def, "650")).toThrow(/multiple of 100/);
		});

		test("minimum contrast only accepts the discrete choices", () => {
			const def = getSettingDefinition("terminalMinimumContrast");
			expect(parseSettingValue(def, "4.5")).toBe(4.5);
			expect(() => parseSettingValue(def, "2")).toThrow(/Invalid value/);
		});

		test("strings enforce max length", () => {
			const def = getSettingDefinition("terminalFontFamily");
			expect(parseSettingValue(def, "JetBrains Mono")).toBe("JetBrains Mono");
			expect(() => parseSettingValue(def, "x".repeat(501))).toThrow(
				/at most 500/,
			);
		});
	});

	test("allowedValues renders something for every setting", () => {
		for (const def of SETTINGS) {
			expect(allowedValues(def).length).toBeGreaterThan(0);
		}
	});
});

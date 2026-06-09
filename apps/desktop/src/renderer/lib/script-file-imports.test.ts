import { describe, expect, test } from "bun:test";
import {
	isScriptFileImportSupported,
	SCRIPT_FILE_IMPORT_ACCEPT,
	SCRIPT_FILE_IMPORT_EXTENSIONS,
} from "./script-file-imports";

describe("script file imports", () => {
	test("accept string stays in sync with supported extensions", () => {
		expect(SCRIPT_FILE_IMPORT_ACCEPT).toBe(
			SCRIPT_FILE_IMPORT_EXTENSIONS.join(","),
		);
	});

	test("keeps Unix script imports supported", () => {
		expect(isScriptFileImportSupported("setup.sh")).toBe(true);
		expect(isScriptFileImportSupported("teardown.bash")).toBe(true);
		expect(isScriptFileImportSupported("run.zsh")).toBe(true);
		expect(isScriptFileImportSupported("launch.command")).toBe(true);
	});

	test("supports Windows-native script imports", () => {
		expect(isScriptFileImportSupported("setup.cmd")).toBe(true);
		expect(isScriptFileImportSupported("teardown.BAT")).toBe(true);
		expect(isScriptFileImportSupported("setup.ps1")).toBe(true);
		expect(isScriptFileImportSupported("profile.psm1")).toBe(true);
	});

	test("supports portable Bun and Node script imports", () => {
		expect(isScriptFileImportSupported("setup.ts")).toBe(true);
		expect(isScriptFileImportSupported("teardown.js")).toBe(true);
		expect(isScriptFileImportSupported("release.mjs")).toBe(true);
		expect(isScriptFileImportSupported("legacy.cjs")).toBe(true);
	});

	test("rejects non-script-looking files", () => {
		expect(isScriptFileImportSupported("notes.md")).toBe(false);
		expect(isScriptFileImportSupported("script.txt")).toBe(false);
		expect(isScriptFileImportSupported("script.ts.txt")).toBe(false);
	});
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	exportTheme,
	importThemes,
	listThemeChoices,
	readThemeState,
	removeCustomTheme,
	requireThemeId,
	writeThemeState,
} from "./app-state";

let homeDir: string;
let previousHome: string | undefined;

function writeAppState(state: Record<string, unknown>) {
	writeFileSync(
		join(homeDir, "app-state.json"),
		JSON.stringify(state, null, 2),
	);
}

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	homeDir = mkdtempSync(join(tmpdir(), "superset-cli-appstate-"));
	process.env.SUPERSET_HOME_DIR = homeDir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(homeDir, { recursive: true, force: true });
});

describe("theme state", () => {
	test("read errors when app-state.json is missing", () => {
		expect(() => readThemeState()).toThrow(/not found/);
	});

	test("read fills defaults for missing fields", () => {
		writeAppState({ themeState: { activeThemeId: "monokai" } });
		const state = readThemeState();
		expect(state.activeThemeId).toBe("monokai");
		expect(state.systemLightThemeId).toBe("light");
		expect(state.customThemes).toEqual([]);
	});

	test("write patches themeState and preserves unrelated app state", async () => {
		writeAppState({
			tabsState: { tabs: [{ id: "tab-1" }] },
			themeState: { activeThemeId: "dark", customThemes: [] },
			lastRunVersion: "1.20.2",
		});
		await writeThemeState({ activeThemeId: "light" });

		const raw = JSON.parse(
			readFileSync(join(homeDir, "app-state.json"), "utf-8"),
		);
		expect(raw.themeState.activeThemeId).toBe("light");
		expect(raw.tabsState.tabs[0].id).toBe("tab-1");
		expect(raw.lastRunVersion).toBe("1.20.2");
	});

	test("theme choices include system, built-ins, and custom themes", () => {
		writeAppState({
			themeState: {
				activeThemeId: "dark",
				customThemes: [{ id: "dracula", name: "Dracula", type: "dark" }],
			},
		});
		const ids = listThemeChoices(readThemeState()).map((choice) => choice.id);
		expect(ids).toEqual(["system", "dark", "light", "monokai", "dracula"]);
	});

	test("requireThemeId validates ids and gates the system pseudo-theme", () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const state = readThemeState();
		expect(requireThemeId(state, "monokai", { allowSystem: false })).toBe(
			"monokai",
		);
		expect(requireThemeId(state, "system", { allowSystem: true })).toBe(
			"system",
		);
		expect(() =>
			requireThemeId(state, "system", { allowSystem: false }),
		).toThrow(/Unknown theme/);
		expect(() =>
			requireThemeId(state, "dracula", { allowSystem: true }),
		).toThrow(/Unknown theme/);
	});
});

describe("custom themes", () => {
	test("import validates, normalizes, and persists a theme file", async () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const file = join(homeDir, "midnight.json");
		writeFileSync(
			file,
			JSON.stringify({
				name: "Midnight Ocean",
				type: "dark",
				ui: { background: "#001122" },
				terminal: { background: "#001122", green: "#33ff99" },
			}),
		);
		const { imported, issues } = await importThemes(file);
		expect(issues).toEqual([]);
		expect(imported.map((theme) => theme.id)).toEqual(["midnight-ocean"]);
		// normalized like the desktop importer: base ui colors merged in
		expect(imported[0]?.ui.background).toBe("#001122");
		expect(imported[0]?.ui.foreground).toBeDefined();
		expect(imported[0]?.terminal?.green).toBe("#33ff99");

		const state = readThemeState();
		expect(state.customThemes).toHaveLength(1);
		expect(
			requireThemeId(state, "midnight-ocean", { allowSystem: false }),
		).toBe("midnight-ocean");
	});

	test("re-importing the same id replaces the existing custom theme", async () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const file = join(homeDir, "t.json");
		writeFileSync(file, JSON.stringify({ id: "mine", ui: { ring: "#111" } }));
		await importThemes(file);
		writeFileSync(file, JSON.stringify({ id: "mine", ui: { ring: "#222" } }));
		await importThemes(file);
		const state = readThemeState();
		expect(state.customThemes).toHaveLength(1);
		expect(state.customThemes[0]?.ui.ring).toBe("#222");
	});

	test("import stamps themes as custom (UI groups by isCustom)", async () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const file = join(homeDir, "t.json");
		writeFileSync(file, JSON.stringify({ id: "mine", ui: {} }));
		const { imported } = await importThemes(file);
		expect(imported[0]?.isCustom).toBeUndefined(); // parser output untouched
		const stored = readThemeState().customThemes[0];
		expect(stored?.isCustom).toBe(true);
		expect(stored?.isBuiltIn).toBe(false);
	});

	test("malformed custom-theme entries are dropped, arrays rejected as state", () => {
		writeAppState({
			themeState: {
				activeThemeId: "dark",
				customThemes: [null, "junk", { name: "no id" }, { id: "ok", ui: {} }],
			},
		});
		expect(readThemeState().customThemes.map((t) => t.id)).toEqual(["ok"]);
		writeFileSync(join(homeDir, "app-state.json"), "[1,2,3]");
		expect(() => readThemeState()).toThrow(/not a JSON object/);
	});

	test("import rejects reserved ids and invalid files", async () => {
		writeAppState({ themeState: { activeThemeId: "dark", customThemes: [] } });
		const file = join(homeDir, "bad.json");
		writeFileSync(file, JSON.stringify({ id: "dark" }));
		await expect(importThemes(file)).rejects.toThrow(/reserved/);
		writeFileSync(file, "not json");
		await expect(importThemes(file)).rejects.toThrow(/Invalid JSON/);
		expect(() => importThemes(join(homeDir, "nope.json"))).toThrow(/not found/);
	});

	test("export returns built-ins and custom themes, rejects unknown ids", () => {
		writeAppState({
			themeState: {
				activeThemeId: "dark",
				customThemes: [{ id: "mine", name: "Mine", type: "dark", ui: {} }],
			},
		});
		expect(exportTheme("dark").name).toBe("Dark");
		expect(exportTheme("dark").isBuiltIn).toBeUndefined();
		expect(exportTheme("mine").name).toBe("Mine");
		expect(() => exportTheme("nope")).toThrow(/Unknown theme/);
	});

	test("remove deletes the theme and falls back active/system references", async () => {
		writeAppState({
			themeState: {
				activeThemeId: "mine",
				systemDarkThemeId: "mine",
				customThemes: [{ id: "mine", name: "Mine", type: "dark", ui: {} }],
			},
		});
		const { themeState: state } = await removeCustomTheme("mine");
		expect(state.customThemes).toEqual([]);
		expect(state.activeThemeId).toBe("dark");
		expect(state.systemDarkThemeId).toBe("dark");
		await expect(removeCustomTheme("mine")).rejects.toThrow(/No custom theme/);
		await expect(removeCustomTheme("dark")).rejects.toThrow(/No custom theme/);
	});
});

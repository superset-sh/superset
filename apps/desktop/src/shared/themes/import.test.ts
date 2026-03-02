import { describe, expect, it } from "bun:test";
import { parseThemeConfigFile } from "./import";

describe("parseThemeConfigFile", () => {
	it("parses a single theme object", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				id: "Solarized Dark",
				name: "Solarized Dark",
				type: "dark",
				terminal: {
					background: "#002b36",
					foreground: "#839496",
				},
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes).toHaveLength(1);
		expect(result.themes[0]?.id).toBe("solarized-dark");
		expect(result.themes[0]?.name).toBe("Solarized Dark");
		expect(result.themes[0]?.terminal?.background).toBe("#002b36");
		expect(result.themes[0]?.terminal?.foreground).toBe("#839496");
		expect(result.themes[0]?.terminal?.red).toBeDefined();
	});

	it("parses a theme pack from { themes: [] }", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				themes: [
					{ name: "Pack One", type: "dark" },
					{ name: "Pack Two", type: "light" },
				],
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes).toHaveLength(2);
		expect(result.themes[0]?.id).toBe("pack-one");
		expect(result.themes[1]?.id).toBe("pack-two");
		expect(result.themes[0]?.type).toBe("dark");
		expect(result.themes[1]?.type).toBe("light");
	});

	it("supports top-level colors alias and partial UI overrides", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				name: "Alias Theme",
				type: "light",
				ui: {
					background: "#fefefe",
				},
				colors: {
					background: "#1e1e2e",
				},
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes[0]?.ui.background).toBe("#fefefe");
		expect(result.themes[0]?.terminal?.background).toBe("#1e1e2e");
		expect(result.themes[0]?.terminal?.foreground).toBeDefined();
	});

	it("returns an error for invalid JSON", () => {
		const result = parseThemeConfigFile("{invalid-json");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toBe("Invalid JSON file");
	});

	it("skips invalid entries but keeps valid themes", () => {
		const result = parseThemeConfigFile(
			JSON.stringify([{ name: "Valid Theme" }, { id: "dark" }]),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes).toHaveLength(1);
		expect(result.themes[0]?.id).toBe("valid-theme");
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toContain("reserved");
	});

	it("fails when no valid themes exist", () => {
		const result = parseThemeConfigFile(JSON.stringify([{ id: "dark" }]));

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain("reserved");
	});
});

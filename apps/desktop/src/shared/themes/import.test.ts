import { describe, expect, it } from "bun:test";
import { parseThemeConfigFile, parseThemeConfigFiles } from "./import";

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

	it("supports partial editor overrides", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				name: "Editor Theme",
				type: "dark",
				ui: {
					highlightActive: "rgba(0, 200, 255, 0.4)",
				},
				editor: {
					colors: {
						background: "#101418",
					},
					syntax: {
						keyword: "#ff79c6",
					},
				},
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes[0]?.editor?.colors?.background).toBe("#101418");
		expect(result.themes[0]?.editor?.syntax?.keyword).toBe("#ff79c6");
		expect(result.themes[0]?.editor?.colors?.searchActive).toBe(
			result.themes[0]?.ui.highlightActive,
		);
		expect(result.themes[0]?.editor?.syntax?.comment).toBeDefined();
	});

	it("keeps terminal undefined for ui-only imported themes", () => {
		const result = parseThemeConfigFile(
			JSON.stringify({
				name: "UI Only Theme",
				type: "dark",
				ui: {
					background: "#112233",
					foreground: "#f4f7fb",
				},
			}),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.themes[0]?.terminal).toBeUndefined();
		expect(result.themes[0]?.ui.background).toBe("#112233");
		expect(result.themes[0]?.ui.foreground).toBe("#f4f7fb");
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

describe("parseThemeConfigFiles", () => {
	it("aggregates themes across multiple files", () => {
		const result = parseThemeConfigFiles([
			{
				name: "first.json",
				content: JSON.stringify({ name: "First Theme", type: "dark" }),
			},
			{
				name: "second.json",
				content: JSON.stringify({
					themes: [
						{ name: "Pack One", type: "light" },
						{ name: "Pack Two", type: "dark" },
					],
				}),
			},
		]);

		expect(result.themes).toHaveLength(3);
		expect(result.themes.map((t) => t.id)).toEqual([
			"first-theme",
			"pack-one",
			"pack-two",
		]);
		expect(result.fileErrors).toHaveLength(0);
		expect(result.issues).toHaveLength(0);
	});

	it("reports per-file errors and continues with other files", () => {
		const result = parseThemeConfigFiles([
			{ name: "broken.json", content: "{not-json" },
			{
				name: "good.json",
				content: JSON.stringify({ name: "Good Theme", type: "dark" }),
			},
		]);

		expect(result.themes).toHaveLength(1);
		expect(result.themes[0]?.id).toBe("good-theme");
		expect(result.fileErrors).toHaveLength(1);
		expect(result.fileErrors[0]?.name).toBe("broken.json");
		expect(result.fileErrors[0]?.error).toBe("Invalid JSON file");
	});

	it("prefixes per-theme issues with file name when multiple files supplied", () => {
		const result = parseThemeConfigFiles([
			{
				name: "pack-a.json",
				content: JSON.stringify([{ name: "Valid A" }, { id: "dark" }]),
			},
			{
				name: "pack-b.json",
				content: JSON.stringify({ name: "Valid B", type: "light" }),
			},
		]);

		expect(result.themes).toHaveLength(2);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).toContain("pack-a.json");
		expect(result.issues[0]).toContain("reserved");
	});

	it("does not prefix issues when only one file is supplied", () => {
		const result = parseThemeConfigFiles([
			{
				name: "only.json",
				content: JSON.stringify([{ name: "Valid" }, { id: "dark" }]),
			},
		]);

		expect(result.themes).toHaveLength(1);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]).not.toContain("only.json");
		expect(result.issues[0]).toContain("reserved");
	});

	it("returns empty result for an empty file list", () => {
		const result = parseThemeConfigFiles([]);

		expect(result.themes).toEqual([]);
		expect(result.issues).toEqual([]);
		expect(result.fileErrors).toEqual([]);
	});
});

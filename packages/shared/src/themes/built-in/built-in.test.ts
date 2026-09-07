import { describe, expect, it } from "bun:test";
import { builtInThemes } from "./index";

describe("builtInThemes", () => {
	it("have unique ids", () => {
		const ids = builtInThemes.map((theme) => theme.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("are flagged built-in and carry the tokens the chrome reads", () => {
		for (const theme of builtInThemes) {
			expect(theme.isBuiltIn).toBe(true);
			expect(theme.ui.success).toBeDefined();
			expect(theme.ui.highlight).toBeDefined();
			expect(theme.ui.highlightForeground).toBeDefined();
			expect(theme.terminal).toBeDefined();
		}
	});

	it("ship more than one light theme", () => {
		const light = builtInThemes.filter((theme) => theme.type === "light");
		expect(light.map((theme) => theme.id)).toEqual([
			"light",
			"catppuccin-latte",
			"solarized-light",
			"vellum",
		]);
	});
});

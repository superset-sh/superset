import { describe, expect, test } from "bun:test";
import {
	detectInstalledNerdFontFamilies,
	isNerdFontFamily,
} from "./installed-nerd-fonts";

describe("isNerdFontFamily", () => {
	test("matches patched family names", () => {
		expect(isNerdFontFamily("JetBrainsMono Nerd Font")).toBe(true);
		expect(isNerdFontFamily("0xProto Nerd Font Mono")).toBe(true);
		expect(isNerdFontFamily("MesloLGLDZ Nerd Font Mono")).toBe(true);
		expect(isNerdFontFamily("MesloLGS NF")).toBe(true);
		expect(isNerdFontFamily("JetBrainsMonoNL NFM")).toBe(true);
	});

	test("rejects proportional variants and regular fonts", () => {
		expect(isNerdFontFamily("0xProto Nerd Font Propo")).toBe(false);
		expect(isNerdFontFamily("JetBrainsMonoNL NFP")).toBe(false);
		expect(isNerdFontFamily("JetBrains Mono")).toBe(false);
		expect(isNerdFontFamily("Menlo")).toBe(false);
		expect(isNerdFontFamily("Inter")).toBe(false);
	});
});

describe("detectInstalledNerdFontFamilies", () => {
	const fontData = (family: string) => ({
		family,
		fullName: family,
		postscriptName: family.replaceAll(" ", ""),
		style: "Regular",
	});

	test("filters, dedupes, and prefers Mono variants", async () => {
		window.queryLocalFonts = async () =>
			[
				"Inter",
				"0xProto Nerd Font",
				"0xProto Nerd Font", // per-style duplicate
				"0xProto Nerd Font Mono",
				"0xProto Nerd Font Propo",
				"MesloLGS NF",
			].map(fontData);

		const families = await detectInstalledNerdFontFamilies();
		expect(families).toEqual([
			"0xProto Nerd Font Mono",
			"0xProto Nerd Font",
			"MesloLGS NF",
		]);

		// Cached: a second call must not re-enumerate.
		window.queryLocalFonts = async () => {
			throw new Error("re-enumerated");
		};
		expect(await detectInstalledNerdFontFamilies()).toEqual(families);
	});
});

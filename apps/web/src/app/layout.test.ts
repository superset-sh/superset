import { describe, expect, test } from "bun:test";

/**
 * This test ensures layout.tsx does not export a viewport config with themeColor,
 * which would cause the browser tab/address bar to inherit the app's color scheme
 * via <meta name="theme-color">.
 *
 * We read the file as text rather than importing it, because importing layout.tsx
 * transitively loads env validation and other modules that require a full runtime
 * environment.
 *
 * See: https://github.com/supersetsh/superset/issues/2401
 */
describe("RootLayout viewport config", () => {
	test("should not include themeColor to prevent browser tab from inheriting app appearance", async () => {
		const layoutSource = await Bun.file(`${import.meta.dir}/layout.tsx`).text();

		// The layout should not contain any themeColor configuration
		expect(layoutSource).not.toContain("themeColor");
	});
});

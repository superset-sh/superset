import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on @xterm/addon-webgl (SUPER-1793, patches/README.md).
// patchedDependencies is keyed to an exact version, so a version bump silently
// drops the patch while everything still builds — these assertions turn that
// into a red test. If this fails after a bump, regenerate the patch per
// patches/README.md; do NOT delete the test.
describe("@xterm/addon-webgl GPU atlas patch", () => {
	const libDir = dirname(require.resolve("@xterm/addon-webgl"));
	const cjs = readFileSync(join(libDir, "addon-webgl.js"), "utf8");
	const esm = readFileSync(join(libDir, "addon-webgl.mjs"), "utf8");

	for (const [name, src] of [
		["addon-webgl.js", cjs],
		["addon-webgl.mjs", esm],
	] as const) {
		test(`${name} clamps atlas texture sizes to 4096`, () => {
			// One clamp in GlyphRenderer (page size), one in WebglRenderer
			// (feeds the oversized-glyph overflow page).
			expect(src.split("Math.min(4096,").length - 1).toBe(2);
		});

		test(`${name} frees merged-away/evicted atlas canvases eagerly`, () => {
			// Two release sites (page merge + evictAllPages), width and height each.
			expect(src.match(/canvas\.width\s*=\s*0/g) ?? []).toHaveLength(2);
			expect(src.match(/canvas\.height\s*=\s*0/g) ?? []).toHaveLength(2);
		});
	}
});

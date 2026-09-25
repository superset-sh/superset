import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Guards the bun patch on trpc-electron (DESKTOP-16T, patches/README.md).
// patchedDependencies is keyed to an exact version, so a version bump silently
// drops the patch while everything still builds — these assertions turn that
// into a red test. If this fails after a bump, regenerate the patch per
// patches/README.md; do NOT delete the test.
describe("trpc-electron disposed-frame patch", () => {
	const distDir = dirname(require.resolve("trpc-electron/main"));

	for (const name of ["main.cjs", "main.mjs"] as const) {
		test(`${name} checks the frame is alive before reading routingId`, () => {
			const src = readFileSync(join(distDir, name), "utf8");

			const listener = src.indexOf('"did-start-navigation"');
			expect(listener).toBeGreaterThan(-1);
			const read = src.indexOf("frameRoutingId", listener);
			expect(read).toBeGreaterThan(listener);

			// Both guards have to sit between the listener and the routingId
			// read: Electron hands the listener `WebFrameMain | null`, and
			// reading any property of a frame whose render frame is gone throws
			// out of webContents.emit. Read the frame's minified binding name so
			// the assertions survive a re-minify.
			const guard = src.slice(listener, read);
			const frame = /frame\s*:\s*([A-Za-z_$][\w$]*)/.exec(guard)?.[1];
			expect(frame).toBeString();
			expect(guard).toContain(`!${frame}`);
			expect(guard).toContain(`${frame}.isDestroyed()`);
		});
	}
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the bun patch on react-native-enriched-markdown (patches/README.md).
// Without it, a code block inside a numbered list item draws the item's
// number on every code line. patchedDependencies is keyed to an exact version,
// so a bump silently drops the patch. If this fails after a bump, check
// upstream for the fix before re-applying the patch; do NOT delete the test.
const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const lockfile = readFileSync(join(repoRoot, "bun.lock"), "utf8");

describe("react-native-enriched-markdown list item patch", () => {
	test("every resolved react-native-enriched-markdown version is patched", () => {
		const resolved = [
			...lockfile.matchAll(
				/"react-native-enriched-markdown": \["react-native-enriched-markdown@([^"]+)"/g,
			),
		].map((match) => `react-native-enriched-markdown@${match[1]}`);

		expect(resolved.length).toBeGreaterThan(0);
		for (const version of resolved) {
			expect(patched[version]).toBeString();
		}
	});

	test("the installed package carries the patch", () => {
		const packageRoot = join(
			import.meta.dir,
			"node_modules/react-native-enriched-markdown/ios",
		);
		expect(
			readFileSync(join(packageRoot, "renderer/ListItemRenderer.m"), "utf8"),
		).toContain("ListContinuationAttribute");
		expect(
			readFileSync(join(packageRoot, "utils/ListMarkerDrawer.m"), "utf8"),
		).toContain("[attrs[ListContinuationAttribute] boolValue]");
	});
});

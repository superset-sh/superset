import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the bun patch on react-native-screens (patches/README.md). Without
// it, a screen pushed after a form sheet has been shown can come up with its
// ScrollView sized to the sheet (half the screen): everything below is
// neither painted nor tappable. patchedDependencies is keyed to an exact
// version, so bumping react-native-screens (an Expo SDK bump will) silently
// drops the patch. If this fails after a bump, check upstream for the fix
// before re-applying the patch; do NOT delete the test.
const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const lockfile = readFileSync(join(repoRoot, "bun.lock"), "utf8");

describe("react-native-screens form sheet scroll view observer patch", () => {
	test("every resolved react-native-screens version is patched", () => {
		const resolved = [
			...lockfile.matchAll(
				/"react-native-screens": \["react-native-screens@([^"]+)"/g,
			),
		].map((match) => `react-native-screens@${match[1]}`);

		expect(resolved.length).toBeGreaterThan(0);
		for (const version of resolved) {
			expect(patched[version]).toBeString();
		}
	});

	test("the patch stops an invalidated sheet from resizing its scroll view", () => {
		for (const path of Object.entries(patched)
			.filter(([name]) => name.startsWith("react-native-screens@"))
			.map(([, file]) => file)) {
			const patch = readFileSync(join(repoRoot, path), "utf8");
			expect(patch).toContain("ios/RNSScreen.mm");
			// 4.27+ declares `invalidated` itself, so a regenerated patch adds only
			// the early return; the assignment line is upstream's from then on.
			expect(patch).toMatch(/\+\s*if \(_invalidated\) \{/);
		}
	});

	test("the installed package carries the patch", () => {
		const source = readFileSync(
			join(
				import.meta.dir,
				"node_modules/react-native-screens/ios/RNSScreen.mm",
			),
			"utf8",
		);
		expect(source).toContain("if (_invalidated) {");
	});
});

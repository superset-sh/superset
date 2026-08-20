import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the bun patch on metro (patches/README.md). Without it, every cold
// release bundle — `expo export`, and so every EAS build — dies with "Failed to
// get the SHA-1" for a Bundle Mode worklet file. patchedDependencies is keyed to
// an exact version, so bumping metro (an Expo SDK bump will) silently drops the
// patch and the store build breaks again. If this fails after a bump, pull the
// matching patch per patches/README.md; do NOT delete the test.
//
// Everything here reads repo files rather than the installed package: metro is
// nobody's declared dependency, so under bun's isolated linker it isn't
// resolvable from this workspace.
const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const lockfile = readFileSync(join(repoRoot, "bun.lock"), "utf8");

describe("metro Bundle Mode SHA-1 patch", () => {
	test("every resolved metro version is patched", () => {
		const resolved = [...lockfile.matchAll(/"metro": \["metro@([^"]+)"/g)].map(
			(match) => `metro@${match[1]}`,
		);

		expect(resolved.length).toBeGreaterThan(0);
		for (const version of resolved) {
			expect(patched[version]).toBeString();
		}
	});

	test("the patch short-circuits SHA-1 for generated .worklets modules", () => {
		for (const path of Object.entries(patched)
			.filter(([name]) => name.startsWith("metro@"))
			.map(([, file]) => file)) {
			const patch = readFileSync(join(repoRoot, path), "utf8");
			expect(patch).toContain("node-haste/DependencyGraph.js");
			expect(patch).toContain('"react-native-worklets"');
			expect(patch).toContain('".worklets"');
			expect(patch).toMatch(
				/\+\s*if \(mixedPath\.includes\(workletsDirPath\)\)/,
			);
		}
	});
});

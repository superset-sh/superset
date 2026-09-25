import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guards the bun patch on expo-observe (patches/README.md). Its podspec asks
// for Swift 6, where the package's mutable global state in Observability.swift
// is an error rather than a warning, so under Xcode 26.3 every local iOS build
// dies in a transitive Expo SDK package. patchedDependencies is keyed to an
// exact version, so bumping expo-observe (an Expo SDK bump will) silently
// drops the patch and the builds break again with nothing pointing here. If
// this fails after a bump, check whether upstream relaxed the podspec before
// re-applying; do NOT delete the test.
const repoRoot = join(import.meta.dir, "../..");
const patched: Record<string, string> =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
		.patchedDependencies ?? {};
const lockfile = readFileSync(join(repoRoot, "bun.lock"), "utf8");

describe("expo-observe swift version patch", () => {
	test("every resolved expo-observe version is patched", () => {
		const resolved = [
			...lockfile.matchAll(/"expo-observe": \["expo-observe@([^"]+)"/g),
		].map((match) => `expo-observe@${match[1]}`);

		expect(resolved.length).toBeGreaterThan(0);
		for (const version of resolved) {
			expect(patched[version]).toBeString();
		}
	});

	test("the patch still drops the podspec out of Swift 6", () => {
		for (const path of Object.entries(patched)
			.filter(([name]) => name.startsWith("expo-observe@"))
			.map(([, file]) => file)) {
			const patch = readFileSync(join(repoRoot, path), "utf8");
			expect(patch).toContain("ios/ExpoObserve.podspec");
			expect(patch).toContain("-  s.swift_version  = '6.0'");
			expect(patch).toContain("+  s.swift_version  = '5.0'");
		}
	});

	test("the installed package carries the patch", () => {
		const podspec = readFileSync(
			join(
				import.meta.dir,
				"node_modules/expo-observe/ios/ExpoObserve.podspec",
			),
			"utf8",
		);
		expect(podspec).toContain("s.swift_version  = '5.0'");
	});
});

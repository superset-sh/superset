import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

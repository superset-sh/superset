import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "..");

describe("host-service-sync package boundary", () => {
	test("has no React or platform runtime dependency", async () => {
		const packageJson = (await Bun.file(
			resolve(packageRoot, "package.json"),
		).json()) as {
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		const runtimeNames = [
			...Object.keys(packageJson.dependencies ?? {}),
			...Object.keys(packageJson.peerDependencies ?? {}),
		].sort();
		expect(runtimeNames).toEqual(["zod", "zustand"]);
	});

	test("source imports no React, Expo, Node runtime, host implementation, or ACP SDK", async () => {
		const prohibited = [
			/\bfrom\s+["']react(?:\/|["'])/,
			/\bfrom\s+["']react-native(?:\/|["'])/,
			/\bfrom\s+["']expo(?:\/|["'])/,
			/\bfrom\s+["']node:/,
			/\bfrom\s+["']@superset\/host-service(?:\/|["'])/,
			/\bfrom\s+["']@agentclientprotocol\//,
		];
		const violations: string[] = [];
		const glob = new Bun.Glob("src/**/*.ts");
		for await (const relativePath of glob.scan({ cwd: packageRoot })) {
			if (relativePath.endsWith(".test.ts")) continue;
			const source = await Bun.file(resolve(packageRoot, relativePath)).text();
			if (prohibited.some((pattern) => pattern.test(source))) {
				violations.push(relativePath);
			}
		}
		expect(violations).toEqual([]);
	});
});

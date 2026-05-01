import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Reproduces #3951: the linux-arm64 distribution tarball ships without
 * `@anush008/tokenizers-linux-arm64-gnu`, so `superset start` crashes on
 * any aarch64 Linux host with `Cannot find module
 * '@anush008/tokenizers-linux-arm64-gnu'`. The omission mirrors #3921's
 * fix for linux-x64.
 *
 * The constants under test live in two files:
 *   - packages/cli/scripts/build-dist.ts (TARGET_NATIVE_PACKAGES)
 *   - packages/host-service/build.ts     (Bun.build external)
 * Both run top-level work at import time, so the test reads them as text
 * and asserts the linux-arm64 binding is listed alongside its sibling
 * platform variants.
 */

const buildDistSource = readFileSync(
	resolve(import.meta.dir, "build-dist.ts"),
	"utf-8",
);
const hostServiceBuildSource = readFileSync(
	resolve(import.meta.dir, "../../host-service/build.ts"),
	"utf-8",
);

function extractTargetBlock(source: string, target: string): string {
	const pattern = new RegExp(`"${target}":\\s*\\[([\\s\\S]*?)\\]`);
	const match = source.match(pattern);
	if (!match?.[1]) {
		throw new Error(`Could not find "${target}" array in build-dist.ts`);
	}
	return match[1];
}

describe("build-dist linux-arm64 native packages (#3951)", () => {
	test("linux-x64 ships @anush008/tokenizers-linux-x64-gnu (#3921 baseline)", () => {
		const block = extractTargetBlock(buildDistSource, "linux-x64");
		expect(block).toContain("@anush008/tokenizers-linux-x64-gnu");
	});

	test("linux-arm64 ships @anush008/tokenizers-linux-arm64-gnu", () => {
		const block = extractTargetBlock(buildDistSource, "linux-arm64");
		expect(block).toContain("@anush008/tokenizers-linux-arm64-gnu");
	});

	test("host-service bundle externalizes @anush008/tokenizers-linux-arm64-gnu", () => {
		expect(hostServiceBuildSource).toContain(
			"@anush008/tokenizers-linux-x64-gnu",
		);
		expect(hostServiceBuildSource).toContain(
			"@anush008/tokenizers-linux-arm64-gnu",
		);
	});
});

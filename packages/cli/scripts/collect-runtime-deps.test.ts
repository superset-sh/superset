import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { collectRuntimePackages } from "./collect-runtime-deps";

const repoRoot = resolve(import.meta.dir, "../../..");
const hostServiceDir = resolve(repoRoot, "packages/host-service");

describe("collectRuntimePackages", () => {
	test("includes @mastra/core when seeded with @mastra/duckdb", () => {
		// @mastra/duckdb declares @mastra/core as a peerDependency, not a
		// regular dependency. The original walker only followed
		// `dependencies`, so distribution tarballs shipped without
		// @mastra/core and the host-service crashed on startup with
		// ERR_MODULE_NOT_FOUND (issue #4628).
		const result = collectRuntimePackages(
			["@mastra/duckdb"],
			hostServiceDir,
			repoRoot,
		);
		const names = new Set(result.map((p) => p.name));
		expect(names.has("@mastra/duckdb")).toBe(true);
		expect(names.has("@mastra/core")).toBe(true);
	});

	test("walks regular dependencies of seeds", () => {
		const result = collectRuntimePackages(
			["@mastra/duckdb"],
			hostServiceDir,
			repoRoot,
		);
		const names = new Set(result.map((p) => p.name));
		expect(names.has("@duckdb/node-api")).toBe(true);
	});

	test("walks transitive dependencies discovered via peer deps", () => {
		// @mastra/core has runtime deps like `chat` and `@modelcontextprotocol/sdk`
		// that are only reachable by first walking the @mastra/core peer dep
		// from @mastra/duckdb.
		const result = collectRuntimePackages(
			["@mastra/duckdb"],
			hostServiceDir,
			repoRoot,
		);
		const names = new Set(result.map((p) => p.name));
		expect(names.has("@modelcontextprotocol/sdk")).toBe(true);
	});
});

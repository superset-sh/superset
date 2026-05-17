import { describe, expect, test } from "bun:test";
import {
	mainExternalizedDependencies,
	packagedAsarUnpackGlobs,
	packagedNodeModuleCopies,
	requiredMaterializedNodeModules,
} from "./runtime-dependencies";

/**
 * Regression coverage for https://github.com/superset-sh/superset/issues/4666
 *
 * The desktop app pulls `mastracode` → `@mastra/duckdb` → `@duckdb/node-api`
 * → `@duckdb/node-bindings` → `@duckdb/node-bindings-<platform>-<arch>`. The
 * platform-specific binding is an `optionalDependencies` entry, so bun only
 * installs the one matching the host. macOS x64 builds are cross-compiled on
 * arm64 runners, which means `@duckdb/node-bindings-darwin-x64` is never on
 * disk and electron-builder ships a DMG missing the native module. Launching
 * the app produces:
 *   Error: Cannot find module '@duckdb/node-bindings-darwin-x64/duckdb.node'
 *
 * The runtime dependency configuration must explicitly package the DuckDB
 * chain (and the asar must unpack the `.node` binaries) so the binding is
 * present regardless of the build host's architecture.
 */
describe("runtime-dependencies — DuckDB native bindings (#4666)", () => {
	test("@duckdb/node-bindings is materialized for electron-builder", () => {
		expect(requiredMaterializedNodeModules).toContain("@duckdb/node-bindings");
	});

	test("DuckDB packages are copied into the packaged app", () => {
		const duckdbCopies = packagedNodeModuleCopies.filter(
			(entry) =>
				entry.from.includes("@duckdb") || entry.from.includes("@mastra/duckdb"),
		);
		expect(duckdbCopies.length).toBeGreaterThan(0);
	});

	test("asar unpacks @duckdb native binaries so dlopen can find them", () => {
		const hasDuckdbAsarPattern = packagedAsarUnpackGlobs.some((glob) =>
			glob.includes("@duckdb"),
		);
		expect(hasDuckdbAsarPattern).toBe(true);
	});

	test("@duckdb/node-api is externalized from the main bundle", () => {
		// mastracode loads DuckDB through dynamic require chains that the bundler
		// cannot resolve; externalizing forces Node to resolve it at runtime from
		// the packaged node_modules.
		expect(mainExternalizedDependencies).toContain("@duckdb/node-api");
	});
});

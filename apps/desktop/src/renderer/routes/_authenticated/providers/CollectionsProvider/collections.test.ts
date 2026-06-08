import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent provider source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent provider source
import { join } from "node:path";

describe("v2 workspace collection create persistence", () => {
	const source = readFileSync(join(import.meta.dir, "collections.ts"), "utf8");
	const v2WorkspacesBlock = source.slice(
		source.indexOf("const v2Workspaces = createPersistedElectricCollection"),
		source.indexOf("v2Workspaces.createIndex"),
	);
	const onInsertBlock = v2WorkspacesBlock.slice(
		v2WorkspacesBlock.indexOf("onInsert: async"),
		v2WorkspacesBlock.indexOf("onUpdate: async"),
	);

	test("uses the host-service create result as the write barrier", () => {
		expect(onInsertBlock).toContain("metadata.result = result");
		expect(onInsertBlock).toContain("return undefined;");
		expect(onInsertBlock).not.toContain(
			"return electricTxidMatch(result.txid);",
		);
	});
});

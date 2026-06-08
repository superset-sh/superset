import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent hook source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent hook source
import { join } from "node:path";

describe("useSubmitWorkspace Trellis setup wiring", () => {
	const source = readFileSync(
		join(import.meta.dir, "useSubmitWorkspace.ts"),
		"utf8",
	);

	test("passes the Trellis initialization intent to workspaces.create snapshots", () => {
		expect(source).toContain("trellisSetup: draft.trellisInitialize");
		expect(source).toContain("? { initialize: true }");
	});

	test("surfaces Trellis setup warnings returned by workspace creation", () => {
		expect(source).toContain("outcome.trellisWarning");
		expect(source).toContain("toast.warning(outcome.trellisWarning)");
	});
});

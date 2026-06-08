import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression test reads adjacent hook source
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression test resolves adjacent hook source
import { join } from "node:path";

describe("useWorkspaceCreates sync confirmation fallback", () => {
	const source = readFileSync(
		join(import.meta.dir, "useWorkspaceCreates.ts"),
		"utf8",
	);

	test("treats a completed host-service create result as success if sync confirmation fails", () => {
		expect(source).toContain("const completeFromHostResult");
		expect(source).toContain(
			"workspace create succeeded but sync confirmation failed",
		);
		expect(source).toContain("return completeFromHostResult(result);");
	});

	test("records a failed workspace create only when no host-service result exists", () => {
		const catchBlock = source.slice(
			source.indexOf(".catch<SubmitOutcome>"),
			source.indexOf("return { workspaceId, completed };"),
		);

		expect(catchBlock).toContain("if (result)");
		expect(
			catchBlock.indexOf("return completeFromHostResult(result);"),
		).toBeLessThan(catchBlock.indexOf("recordFailure(message);"));
	});
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("automation dispatch workspace decoupling", () => {
	test("default dispatch uses the Automation runner instead of creating workspaces", () => {
		const source = readFileSync(
			join(import.meta.dirname, "dispatch.ts"),
			"utf8",
		);

		expect(source).toContain('"agents.runAutomation"');
		expect(source).not.toContain('"workspaces.create"');
		expect(source).not.toContain("v2Workspaces");
		expect(source).not.toContain("createWorkspaceOnHost");
		expect(source).not.toContain("setup.sh");
	});
});

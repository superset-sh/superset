import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(import.meta.dir, "workspaces.ts"), "utf8");

describe("workspaces.create project preparation", () => {
	test("prepares a missing local project instead of requiring setup first", () => {
		expect(SOURCE).toContain("ensureLocalProjectForWorkspaceCreate");
		expect(SOURCE).toContain("cloneRepoInto(cloudProject.repoCloneUrl");
		expect(SOURCE).toContain("persistLocalProject(ctx, projectId, resolved)");

		const createStart = SOURCE.indexOf("create: protectedProcedure");
		const createEnd = SOURCE.indexOf("aiRename: protectedProcedure");
		const createBody = SOURCE.slice(createStart, createEnd);

		expect(createBody).toContain("ensureLocalProjectForWorkspaceCreate");
		expect(createBody).not.toContain(
			"const localProject = requireLocalProject(ctx, input.projectId)",
		);
	});
});

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSource(relativePath: string): string {
	return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("host-service startup dependency boundaries", () => {
	test("createApp keeps chat and model gateway modules off the static startup path", () => {
		const source = readSource("app.ts");

		expect(source).not.toMatch(
			/import\s+\{\s*ChatService\s*\}\s+from\s+["']@superset\/chat\/server\/desktop["']/,
		);
		expect(source).not.toMatch(
			/import\s+\{\s*ChatRuntimeManager\s*\}\s+from\s+["']\.\/runtime\/chat["']/,
		);
		expect(source).not.toMatch(
			/import\s+\{\s*handleModelGatewayRequest\s*\}\s+from\s+["']\.\/model-gateway["']/,
		);

		expect(source).toContain('await import("@superset/chat/server/desktop")');
		expect(source).toContain('import("./runtime/chat")');
		expect(source).toContain('await import("./model-gateway")');
	});

	test("workspace AI naming stays lazy instead of importing Mastra at router load", () => {
		const source = readSource("trpc/router/workspaces/workspaces.ts");

		expect(source).not.toMatch(
			/import\s+\{[^}]*generateWorkspaceNamesFromPrompt[^}]*\}\s+from\s+["'][^"']*ai-workspace-names["']/s,
		);
		expect(source).not.toMatch(
			/import\s+\{[^}]*applyAiWorkspaceRename[^}]*\}\s+from\s+["'][^"']*ai-workspace-names["']/s,
		);
		expect(source).toContain(
			'import("../workspace-creation/utils/ai-workspace-names")',
		);
	});
});

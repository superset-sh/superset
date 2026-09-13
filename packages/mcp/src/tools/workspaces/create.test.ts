import { beforeEach, expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

type Input = {
	projectId?: string;
	hostId: string;
	name: string;
	checkout?: "local" | "worktree";
	branch?: string;
	pr?: number;
	baseBranch?: string;
};
let definition: {
	inputSchema: z.ZodRawShape;
	handler: (input: Input, ctx: object) => Promise<unknown>;
};
let request: { procedure: string; input: unknown } | undefined;
mock.module("../../define-tool", () => ({
	defineTool: (_server: unknown, value: typeof definition) => {
		definition = value;
	},
}));
mock.module("../../host-service-client", () => ({
	hostServiceCall: async (
		_ctx: unknown,
		procedure: string,
		_kind: string,
		input: unknown,
	) => {
		request = { procedure, input };
		return {};
	},
}));
const { register } = await import("./create");
register({} as McpServer);
const input: Input = {
	hostId: "host",
	projectId: "9f1ca3e7-df91-43a1-bfa2-b4f9ac14aeb0",
	name: "local",
	checkout: "local",
};
beforeEach(() => {
	request = undefined;
});
test("exposes local checkout and uses a procedure older hosts cannot silently reinterpret", async () => {
	const parsed = z.object(definition.inputSchema).parse(input) as Input;
	await definition.handler(parsed, {});
	expect(request?.procedure).toBe("workspaces.createLocal");
	expect(request?.input).toMatchObject({ checkout: "local" });
});
test("keeps ordinary worktrees on the existing endpoint", async () => {
	await definition.handler(
		{ ...input, checkout: undefined, branch: "feature" },
		{},
	);
	expect(request?.procedure).toBe("workspaces.create");
});
test.each([
	"branch",
	"pr",
	"baseBranch",
] as const)("rejects local plus %s before calling the host", async (field) => {
	await expect(
		definition.handler(
			{ ...input, [field]: field === "pr" ? 12 : "feature" },
			{},
		),
	).rejects.toThrow("cannot be combined");
	expect(request).toBeUndefined();
});
test("rejects checkout on sessions", async () => {
	await expect(
		definition.handler({ ...input, projectId: undefined }, {}),
	).rejects.toThrow("requires");
	expect(request).toBeUndefined();
});

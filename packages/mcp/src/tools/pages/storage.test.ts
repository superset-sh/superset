import { expect, mock, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

let definition: {
	inputSchema: z.ZodObject;
	handler: (input: unknown, ctx: object) => Promise<unknown>;
};
mock.module("../../define-tool", () => ({
	defineTool: (_server: unknown, value: typeof definition) => {
		definition = value;
	},
}));

const calls: { procedure: string; input: unknown }[] = [];
mock.module("../../caller", () => ({
	createMcpCaller: () => ({
		page: {
			storageKeys: async (input: unknown) => {
				calls.push({ procedure: "storageKeys", input });
				return { pageId: "page-1", keys: [] };
			},
			storageRecords: async (input: unknown) => {
				calls.push({ procedure: "storageRecords", input });
				return { pageId: "page-1", key: "votes", records: [] };
			},
		},
	}),
}));

const { register } = await import("./storage");
register({} as McpServer);

const call = async (input: Record<string, unknown>) => {
	calls.length = 0;
	await definition.handler(definition.inputSchema.parse(input), {});
	return calls[0];
};

test("a key reads every person's slot for that key", async () => {
	expect(await call({ slug: "q3", key: "votes" })).toEqual({
		procedure: "storageRecords",
		input: { slug: "q3", key: "votes" },
	});
});

test("an omitted or null key lists the page's keys", async () => {
	expect(await call({ slug: "q3" })).toEqual({
		procedure: "storageKeys",
		input: { slug: "q3" },
	});
	expect((await call({ slug: "q3", key: null }))?.procedure).toBe(
		"storageKeys",
	);
});

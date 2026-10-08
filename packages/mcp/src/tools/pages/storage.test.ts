import { afterAll, expect, mock, test } from "bun:test";
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

const PAGE_ID = "3f7a1c22-9c2e-4e3a-9a8b-1f0b6c2d4e55";
mock.module("../../caller", () => ({
	createMcpCaller: () => ({
		page: { get: async () => ({ id: PAGE_ID }) },
	}),
}));

const seen: { url: string; authorization: string | null }[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
const realtime = Bun.serve({
	port: 0,
	fetch(request) {
		seen.push({
			url: new URL(request.url).pathname + new URL(request.url).search,
			authorization: request.headers.get("authorization"),
		});
		return Response.json(reply.body, { status: reply.status });
	},
});
afterAll(() => realtime.stop());

const { register } = await import("./storage");
register({} as McpServer);

const call = (input: Record<string, unknown>) =>
	definition.handler(definition.inputSchema.parse(input), {
		realtimeUrl: `http://127.0.0.1:${realtime.port}`,
		bearerToken: "user-jwt",
	});

test("reads one key from realtime with the user's token, by slug", async () => {
	seen.length = 0;
	reply = {
		status: 200,
		body: { pageId: PAGE_ID, key: "votes", records: [] },
	};
	expect(await call({ slug: "q3", key: "votes" })).toEqual({
		pageId: PAGE_ID,
		key: "votes",
		records: [],
	});
	expect(seen[0]).toEqual({
		url: `/v2/page/${PAGE_ID}/storage/records?key=votes`,
		authorization: "Bearer user-jwt",
	});
});

test("an omitted or null key asks for the key list", async () => {
	seen.length = 0;
	reply = { status: 200, body: { pageId: PAGE_ID, keys: [] } };
	await call({ id: PAGE_ID });
	await call({ id: PAGE_ID, key: null });
	expect(seen.map((request) => request.url)).toEqual([
		`/v2/page/${PAGE_ID}/storage/records`,
		`/v2/page/${PAGE_ID}/storage/records`,
	]);
});

test("passes on realtime's refusal", async () => {
	reply = {
		status: 403,
		body: {
			error: "You cannot read this page's storage",
		},
	};
	await expect(call({ id: PAGE_ID })).rejects.toThrow(
		"You cannot read this page's storage",
	);
});

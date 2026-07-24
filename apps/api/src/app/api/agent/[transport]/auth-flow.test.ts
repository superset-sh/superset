import { describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: { NEXT_PUBLIC_API_URL: "http://localhost" },
}));

import type { McpContext } from "@superset/mcp/auth";
import { type McpRequestDeps, verifyToken } from "./auth-flow";

// A JWT-shaped bearer token (three non-empty dot-separated parts) so the
// verifier takes the OAuth branch. The signature is never checked here — the
// injected verifyAccessToken stub decides the payload.
const JWT = "header.payload.signature";

function makeDeps(
	payload: Record<string, unknown>,
	overrides: Partial<McpRequestDeps> = {},
): McpRequestDeps {
	return {
		apiUrl: "http://localhost",
		authApi: {
			getSession: async () => null,
			verifyApiKey: async () => ({ valid: false, key: null }),
		},
		createServer: (() => {
			throw new Error("not used");
		}) as unknown as McpRequestDeps["createServer"],
		createTransport: () => {
			throw new Error("not used");
		},
		verifyAccessToken: (async () =>
			payload) as unknown as McpRequestDeps["verifyAccessToken"],
		...overrides,
	};
}

function mcpRequest(): Request {
	return new Request("http://localhost/api/agent/mcp", {
		headers: { authorization: `Bearer ${JWT}` },
	});
}

describe("verifyToken — MCP OAuth azp gate", () => {
	test("rejects a token minted to an untrusted (attacker DCR) client", async () => {
		const deps = makeDeps({
			sub: "victim-user",
			organizationId: "victim-org",
			azp: "attacker-dcr-client",
		});

		const info = await verifyToken(mcpRequest(), deps);

		expect(info).toBeUndefined();
	});

	test("accepts a token from a trusted client", async () => {
		const deps = makeDeps({
			sub: "victim-user",
			organizationId: "victim-org",
			azp: "superset-cli",
		});

		const info = await verifyToken(mcpRequest(), deps);

		expect(info).toBeDefined();
		const ctx = info?.extra?.mcpContext as McpContext;
		expect(ctx.userId).toBe("victim-user");
		expect(ctx.organizationId).toBe("victim-org");
	});

	test("accepts a first-party token with no azp claim", async () => {
		const deps = makeDeps({
			sub: "user",
			organizationId: "org",
		});

		const info = await verifyToken(mcpRequest(), deps);

		expect(info).toBeDefined();
	});
});

import { describe, expect, it } from "bun:test";
import { type McpRequestDeps, verifyToken } from "./auth-flow";

const JWT_SHAPED_TOKEN = "header.payload.signature";

function makeDeps(payload: Record<string, unknown>): McpRequestDeps {
	return {
		apiUrl: "http://localhost:3001",
		authApi: {
			getSession: async () => null,
			verifyApiKey: async () => ({ valid: false, key: null }),
		},
		createServer: (() => {
			throw new Error("createServer should not be called");
		}) as unknown as McpRequestDeps["createServer"],
		createTransport: () => {
			throw new Error("createTransport should not be called");
		},
		verifyAccessToken: (async () =>
			payload) as unknown as McpRequestDeps["verifyAccessToken"],
	};
}

function makeRequest(): Request {
	return new Request("http://localhost:3001/api/agent/mcp", {
		method: "POST",
		headers: { authorization: `Bearer ${JWT_SHAPED_TOKEN}` },
	});
}

describe("verifyToken cross-tenant organization guard", () => {
	it("rejects a token whose organizationId is not one of the subject's memberships", async () => {
		// The reported attack: a token minted for one identity naming a victim's
		// organization the subject never belonged to.
		const deps = makeDeps({
			sub: "user-1",
			organizationId: "victim-org",
			organizationIds: ["attacker-own-org"],
			scope: "mcp:full",
		});

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo).toBeUndefined();
	});

	it("accepts a member's token, including a third-party client's (azp is not gated)", async () => {
		// A legitimate third-party MCP client (Claude Code, OpenCode, ...) acting
		// for its own authenticated user must pass — azp is deliberately not gated.
		const deps = makeDeps({
			sub: "user-1",
			azp: "some-dynamically-registered-client-id",
			organizationId: "org-1",
			organizationIds: ["org-1", "org-2"],
			scope: "mcp:full",
		});

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo?.extra?.mcpContext).toEqual({
			userId: "user-1",
			organizationId: "org-1",
		});
	});

	it("rejects a token that carries no organizationIds membership claim", async () => {
		const deps = makeDeps({
			sub: "user-1",
			organizationId: "org-1",
			scope: "mcp:full",
		});

		const authInfo = await verifyToken(makeRequest(), deps);

		expect(authInfo).toBeUndefined();
	});
});

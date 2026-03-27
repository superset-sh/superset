import { describe, expect, it, mock } from "bun:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	handleMcpRequest,
	isApiKeyBearerToken,
	type McpRequestDeps,
	unauthorizedResponse,
	verifyToken,
} from "./auth-flow";

function createRequest(headers?: HeadersInit): Request {
	return new Request("https://api.superset.sh/api/agent/mcp", {
		method: "POST",
		headers,
	});
}

function createDeps(overrides?: Partial<McpRequestDeps>): McpRequestDeps & {
	sessionSpy: ReturnType<typeof mock>;
	apiKeySpy: ReturnType<typeof mock>;
	oauthSpy: ReturnType<typeof mock>;
	connectSpy: ReturnType<typeof mock>;
	transportHandleSpy: ReturnType<typeof mock>;
} {
	const sessionSpy = mock(async () => null);
	const apiKeySpy = mock(async () => ({ valid: false, key: null }));
	const oauthSpy = mock(async () => {
		throw new Error("invalid token");
	});
	const connectSpy = mock(async () => {});
	const transportHandleSpy = mock(
		async (_req: Request, _options?: { authInfo?: AuthInfo }) =>
			new Response("ok"),
	);

	return {
		apiUrl: "https://api.superset.sh",
		authApi: {
			getSession: sessionSpy,
			verifyApiKey: apiKeySpy,
		},
		createServer: () =>
			({
				connect: connectSpy,
			}) as unknown as ReturnType<McpRequestDeps["createServer"]>,
		createTransport: () =>
			({
				handleRequest: transportHandleSpy,
			}) as unknown as WebStandardStreamableHTTPServerTransport,
		verifyAccessToken: oauthSpy as McpRequestDeps["verifyAccessToken"],
		sessionSpy,
		apiKeySpy,
		oauthSpy,
		connectSpy,
		transportHandleSpy,
		...overrides,
	};
}

describe("MCP auth flow", () => {
	it("detects API key bearer tokens by prefix", () => {
		expect(isApiKeyBearerToken("sk_live_123")).toBe(true);
		expect(isApiKeyBearerToken("oauth-token")).toBe(false);
	});

	it("short-circuits invalid API keys without falling through", async () => {
		const deps = createDeps();

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer sk_live_invalid" }),
			deps,
		);

		expect(authInfo).toBeUndefined();
		expect(deps.apiKeySpy).toHaveBeenCalledTimes(1);
		expect(deps.oauthSpy).toHaveBeenCalledTimes(0);
		expect(deps.sessionSpy).toHaveBeenCalledTimes(0);
	});

	it("accepts case-insensitive bearer auth schemes", async () => {
		const deps = createDeps();

		const authInfo = await verifyToken(
			createRequest({ authorization: "bearer sk_live_invalid" }),
			deps,
		);

		expect(authInfo).toBeUndefined();
		expect(deps.apiKeySpy).toHaveBeenCalledTimes(1);
		expect(deps.oauthSpy).toHaveBeenCalledTimes(0);
		expect(deps.sessionSpy).toHaveBeenCalledTimes(0);
	});

	it("accepts valid API keys", async () => {
		const deps = createDeps({
			authApi: {
				getSession: mock(async () => null),
				verifyApiKey: mock(async () => ({
					valid: true,
					key: {
						userId: "user-1",
						metadata: JSON.stringify({ organizationId: "org-1" }),
					},
				})),
			},
		});

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer sk_live_valid" }),
			deps,
		);

		expect(authInfo).toEqual({
			token: "api-key",
			clientId: "api-key",
			scopes: ["mcp:full"],
			extra: {
				mcpContext: {
					userId: "user-1",
					organizationId: "org-1",
				},
			},
		});
	});

	it("accepts OAuth access tokens before session lookup", async () => {
		const verifyAccessToken = mock(async () => ({
			sub: "user-2",
			organizationId: "org-2",
			scope: "profile email",
			azp: "client-1",
		})) as McpRequestDeps["verifyAccessToken"];
		const deps = createDeps({
			apiUrl: "https://api.superset.sh/",
			verifyAccessToken,
		});

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer oauth.token.value" }),
			deps,
		);

		expect(authInfo).toEqual({
			token: "oauth.token.value",
			clientId: "client-1",
			scopes: ["profile", "email"],
			extra: {
				mcpContext: {
					userId: "user-2",
					organizationId: "org-2",
				},
			},
		});
		expect(deps.sessionSpy).toHaveBeenCalledTimes(0);
		expect(
			(
				verifyAccessToken as typeof verifyAccessToken & {
					mock: { calls: unknown[][] };
				}
			).mock.calls[0]?.[1],
		).toEqual({
			jwksUrl: "https://api.superset.sh/api/auth/jwks",
			verifyOptions: {
				issuer: "https://api.superset.sh",
				audience: ["https://api.superset.sh", "https://api.superset.sh/"],
			},
		});
	});

	it("accepts opaque bearer session tokens without attempting OAuth verification", async () => {
		const deps = createDeps({
			authApi: {
				getSession: mock(async () => ({
					user: { id: "user-3" },
					session: { activeOrganizationId: "org-3" },
				})),
				verifyApiKey: mock(async () => ({ valid: false, key: null })),
			},
		});

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer session-token" }),
			deps,
		);

		expect(authInfo).toEqual({
			token: "session",
			clientId: "session",
			scopes: ["mcp:full"],
			extra: {
				mcpContext: {
					userId: "user-3",
					organizationId: "org-3",
				},
			},
		});
		expect(deps.oauthSpy).toHaveBeenCalledTimes(0);
	});

	it("falls back to session auth when JWT bearer token is not a valid OAuth access token", async () => {
		const deps = createDeps({
			authApi: {
				getSession: mock(async () => ({
					user: { id: "user-3" },
					session: { activeOrganizationId: "org-3" },
				})),
				verifyApiKey: mock(async () => ({ valid: false, key: null })),
			},
		});

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer invalid.jwt.token" }),
			deps,
		);

		expect(authInfo).toEqual({
			token: "session",
			clientId: "session",
			scopes: ["mcp:full"],
			extra: {
				mcpContext: {
					userId: "user-3",
					organizationId: "org-3",
				},
			},
		});
		expect(deps.oauthSpy).toHaveBeenCalledTimes(1);
	});

	it("does not fall back to session auth after a verified JWT is missing required claims", async () => {
		const sessionSpy = mock(async () => ({
			user: { id: "user-3" },
			session: { activeOrganizationId: "org-3" },
		}));
		const verifyAccessToken = mock(async () => ({
			sub: "user-2",
		})) as McpRequestDeps["verifyAccessToken"];
		const deps = createDeps({
			authApi: {
				getSession: sessionSpy,
				verifyApiKey: mock(async () => ({ valid: false, key: null })),
			},
			verifyAccessToken,
		});

		const authInfo = await verifyToken(
			createRequest({ authorization: "Bearer verified.jwt.token" }),
			deps,
		);

		expect(authInfo).toBeUndefined();
		expect(verifyAccessToken).toHaveBeenCalledTimes(1);
		expect(sessionSpy).toHaveBeenCalledTimes(0);
	});

	it("returns a path-specific unauthorized challenge", () => {
		const response = unauthorizedResponse(createRequest());

		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBe(
			'Bearer resource_metadata="https://api.superset.sh/.well-known/oauth-protected-resource/api/agent/mcp"',
		);
	});

	it("does not start MCP transport when auth fails", async () => {
		const deps = createDeps();

		const response = await handleMcpRequest(
			createRequest({ authorization: "Bearer sk_live_invalid" }),
			deps,
		);

		expect(response.status).toBe(401);
		expect(deps.connectSpy).toHaveBeenCalledTimes(0);
		expect(deps.transportHandleSpy).toHaveBeenCalledTimes(0);
	});

	it("starts MCP transport when auth succeeds", async () => {
		const deps = createDeps({
			authApi: {
				getSession: mock(async () => ({
					user: { id: "user-4" },
					session: { activeOrganizationId: "org-4" },
				})),
				verifyApiKey: mock(async () => ({ valid: false, key: null })),
			},
		});

		const response = await handleMcpRequest(createRequest(), deps);

		expect(response.status).toBe(200);
		expect(deps.connectSpy).toHaveBeenCalledTimes(1);
		expect(deps.transportHandleSpy).toHaveBeenCalledTimes(1);
	});
});

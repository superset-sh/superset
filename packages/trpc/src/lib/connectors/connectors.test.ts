import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CONNECTOR_SLUGS, getConnector } from "@superset/shared/connectors";
import { generateCodeChallenge } from "better-auth/oauth2";
import {
	assertRespondingIssuer,
	authorizeUrl,
	connectorMethod,
	IssuerMismatchError,
	MissingConnectorEnvError,
	probeIdentity,
	type ResolvedEndpoints,
	requireConnector,
	resolveConnectorTemplate,
	UnknownConnectorError,
} from "./index";

const ENV = {
	SLACK_CLIENT_ID: "sc",
	SLACK_CLIENT_SECRET: "ss",
	GOOGLE_TEMP_CLIENT_ID: "gc",
	GOOGLE_TEMP_CLIENT_SECRET: "gs",
	SENTRY_CLIENT_ID: "xc",
	SENTRY_CLIENT_SECRET: "xs",
	SENTRY_APP_SLUG: "superset-app",
};

const original: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const [key, value] of Object.entries(ENV)) {
		original[key] = process.env[key];
		process.env[key] = value;
	}
});

afterEach(() => {
	for (const key of Object.keys(ENV)) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});

const authorize = async (slug: string) =>
	new URL(
		(
			await authorizeUrl(slug, connectorMethod(requireConnector(slug)), {
				redirectUri: "https://api.test/cb",
				state: "st",
			})
		).url,
	);

describe("authorizeUrl", () => {
	test("slack asks for bot and user scopes in one authorize", async () => {
		const params = (await authorize("slack")).searchParams;
		expect(params.get("user_scope")).toContain("search:read");
		expect(params.get("scope")).toContain("app_mentions:read");
		expect(params.get("scope")).not.toContain("search:read");
	});

	test("google joins scopes with a space and keeps authorization_params", async () => {
		const params = (await authorize("google")).searchParams;
		expect(params.get("scope")).toContain("openid email");
		expect(params.get("access_type")).toBe("offline");
		expect(params.get("include_granted_scopes")).toBe("true");
	});

	test("app_install resolves the env template and sends no client_id", async () => {
		const url = await authorize("sentry");
		expect(url.pathname).toBe("/sentry-apps/superset-app/external-install/");
		expect(url.searchParams.get("client_id")).toBeNull();
	});

	test("a missing client secret is named, not swallowed", async () => {
		delete process.env.SLACK_CLIENT_SECRET;
		expect(authorize("slack")).rejects.toThrow(MissingConnectorEnvError);
	});

	test("a static client sends no PKCE challenge", async () => {
		const params = (await authorize("google")).searchParams;
		expect(params.get("code_challenge")).toBeNull();
	});

	test("pkce puts an S256 challenge on the URL and returns the verifier", async () => {
		const method = {
			...connectorMethod(requireConnector("google")),
			pkce: true,
		} as never;
		const target = await authorizeUrl("google", method, {
			redirectUri: "https://api.test/cb",
			state: "st",
		});
		const params = new URL(target.url).searchParams;
		expect(target.codeVerifier).toBeTruthy();
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("code_challenge")).toBe(
			await generateCodeChallenge(target.codeVerifier as string),
		);
	});
});

describe("requireConnector", () => {
	test("an unknown slug names itself", () => {
		expect(() => requireConnector("dropbox")).toThrow(UnknownConnectorError);
	});
});

describe("resolveConnectorTemplate", () => {
	test("leaves an unresolvable placeholder alone", () => {
		expect(resolveConnectorTemplate(`a/$\{params.missing}/b`, {})).toBe(
			`a/$\{params.missing}/b`,
		);
	});
});

describe("probeIdentity", () => {
	const realFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	const respond = (
		payload: unknown,
		init: { status?: number; body?: string; contentType?: string } = {},
	) => {
		const calls: { url: string; method: string; auth: string | null }[] = [];
		globalThis.fetch = (async (url: string, request: RequestInit) => {
			calls.push({
				url,
				method: request.method ?? "GET",
				auth: new Headers(request.headers).get("Authorization"),
			});
			return new Response(init.body ?? JSON.stringify(payload), {
				status: init.status ?? 200,
				headers: { "Content-Type": init.contentType ?? "application/json" },
			});
		}) as unknown as typeof fetch;
		return calls;
	};

	test("splits slack into workspace and person", async () => {
		respond({
			team_id: "T123",
			team: "Tegon",
			user_id: "U9",
			user: "harshith",
		});
		const identity = await probeIdentity(
			"slack",
			connectorMethod(requireConnector("slack")),
			"xoxp-test",
		);
		expect(identity.account).toEqual({ id: "T123", label: "Tegon" });
		expect(identity.user).toEqual({ id: "U9", label: "harshith" });
	});

	test("an org-scoped connector yields no user", async () => {
		respond({ organization: { slug: "tegon", name: "Tegon" } });
		const identity = await probeIdentity(
			"sentry",
			connectorMethod(requireConnector("sentry")),
			"sen-test",
		);
		expect(identity.account.id).toBe("tegon");
		expect(identity.user).toBeNull();
	});

	test("a url-less probe reads the token response and sends nothing", async () => {
		globalThis.fetch = (() => {
			throw new Error("probeIdentity made a request it did not need");
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"notion_mcp",
			connectorMethod(requireConnector("notion_mcp")),
			"ntn-test",
			undefined,
			{
				workspace_id: "ws-1",
				workspace_name: "Superset",
				user_id: "u-9",
			},
		);

		expect(identity.account).toEqual({ id: "ws-1", label: "Superset" });
		expect(identity.user).toEqual({ id: "u-9", label: null });
	});

	test("sentry_mcp asks the MCP server who the token belongs to", async () => {
		const calls: {
			method?: string;
			httpMethod: string;
			protocolHeader: string | null;
			params?: { name?: string };
		}[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			const headers = new Headers(init.headers);
			const body = init.body
				? (JSON.parse(String(init.body)) as { id?: number; method?: string })
				: {};
			calls.push({
				method: body.method,
				httpMethod: init.method ?? "GET",
				protocolHeader: headers.get("MCP-Protocol-Version"),
				params: (body as { params?: { name?: string } }).params,
			});
			if (init.method === "DELETE") return new Response(null, { status: 204 });
			if (body.id === undefined) return new Response(null, { status: 202 });
			const result =
				body.method === "tools/call"
					? {
							structuredContent: {
								user: { id: "42", name: "Harshith", email: "h@tegon.ai" },
							},
						}
					: {
							protocolVersion: "2025-06-18",
							serverInfo: { name: "Sentry MCP" },
						};
			const payload = JSON.stringify(
				{ jsonrpc: "2.0", id: body.id, result },
				null,
				1,
			);
			const dataLines = payload
				.split("\n")
				.map((line) => `data: ${line}`)
				.join("\n");
			const serverRequest = `event: message\ndata: ${JSON.stringify({
				jsonrpc: "2.0",
				id: String(body.id),
				method: "roots/list",
			})}`;
			return new Response(
				`${serverRequest}\n\nevent: message\n${dataLines}\n\n: keep-alive\n\n`,
				{
					status: 200,
					headers: {
						"Content-Type": "text/event-stream",
						"mcp-session-id": "sess-1",
					},
				},
			);
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"sentry_mcp",
			connectorMethod(requireConnector("sentry_mcp")),
			"mcp-test",
		);

		expect(calls.map((c) => c.method ?? `[${c.httpMethod}]`)).toEqual([
			"initialize",
			"notifications/initialized",
			"tools/call",
			"[DELETE]",
		]);
		expect(calls[2]?.params?.name).toBe("execute_sentry_tool");
		expect(calls[1]?.protocolHeader).toBe("2025-06-18");
		expect(calls[2]?.protocolHeader).toBe("2025-06-18");
		expect(identity.account).toEqual({ id: "42", label: "h@tegon.ai" });
		expect(identity.user).toEqual({ id: "42", label: "Harshith" });
	});

	test("stripe reads the account behind the token as text content", async () => {
		const account = {
			accounts: [
				{ stripe_context: "acct_1Example", livemode: true, name: "Tegon" },
			],
		};
		const calls: { method?: string; name?: string }[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			const body = init.body
				? (JSON.parse(String(init.body)) as {
						id?: number;
						method?: string;
						params?: { name?: string };
					})
				: {};
			calls.push({ method: body.method, name: body.params?.name });
			if (init.method === "DELETE") return new Response(null, { status: 204 });
			if (body.id === undefined) return new Response(null, { status: 202 });
			const result =
				body.method === "tools/call"
					? { content: [{ type: "text", text: JSON.stringify(account) }] }
					: { protocolVersion: "2025-06-18" };
			return new Response(
				JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"stripe",
			connectorMethod(requireConnector("stripe")),
			"stripe-test",
		);

		expect(calls[2]).toEqual({
			method: "tools/call",
			name: "list_available_accounts_or_orgs",
		});
		expect(identity.account).toEqual({ id: "acct_1Example", label: "Tegon" });
		expect(identity.user).toEqual({ id: "acct_1Example", label: "Tegon" });
	});

	test("neon_mcp reads the first organization from a text array", async () => {
		const organizations = [{ id: "org-cold-bar", name: "Tegon" }];
		const calls: { method?: string; name?: string }[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			const body = init.body
				? (JSON.parse(String(init.body)) as {
						id?: number;
						method?: string;
						params?: { name?: string };
					})
				: {};
			calls.push({ method: body.method, name: body.params?.name });
			if (init.method === "DELETE") return new Response(null, { status: 204 });
			if (body.id === undefined) return new Response(null, { status: 202 });
			const result =
				body.method === "tools/call"
					? {
							content: [{ type: "text", text: JSON.stringify(organizations) }],
						}
					: { protocolVersion: "2025-06-18" };
			return new Response(
				JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"neon_mcp",
			connectorMethod(requireConnector("neon_mcp")),
			"neon-test",
		);

		expect(calls[2]).toEqual({
			method: "tools/call",
			name: "list_organizations",
		});
		expect(identity.account).toEqual({ id: "org-cold-bar", label: "Tegon" });
		expect(identity.user).toEqual({ id: "org-cold-bar", label: "Tegon" });
	});

	test("posthog_mcp asks the authorization server's userinfo endpoint", async () => {
		const calls = respond({ sub: "user_01", email: "h@tegon.ai" });

		const identity = await probeIdentity(
			"posthog_mcp",
			connectorMethod(requireConnector("posthog_mcp")),
			"mcp-test",
		);

		expect(calls).toEqual([
			{
				url: "https://oauth.posthog.com/oauth/userinfo/",
				method: "GET",
				auth: "Bearer mcp-test",
			},
		]);
		expect(identity.account).toEqual({ id: "user_01", label: "h@tegon.ai" });
		expect(identity.user).toEqual({ id: "user_01", label: "h@tegon.ai" });
	});

	test("stripe survives an account with no name", async () => {
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			const body = init.body
				? (JSON.parse(String(init.body)) as { id?: number; method?: string })
				: {};
			if (init.method === "DELETE") return new Response(null, { status: 204 });
			if (body.id === undefined) return new Response(null, { status: 202 });
			const result =
				body.method === "tools/call"
					? {
							structuredContent: {
								accounts: [{ stripe_context: "acct_1Bare", livemode: true }],
							},
						}
					: { protocolVersion: "2025-06-18" };
			return new Response(
				JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"stripe",
			connectorMethod(requireConnector("stripe")),
			"stripe-test",
		);

		expect(identity.account).toEqual({ id: "acct_1Bare", label: null });
		expect(identity.user).toEqual({ id: "acct_1Bare", label: null });
	});

	test("a result with no account id names the shape that came back", async () => {
		respond({ data: [{ account: "acct_1", secret: "s3cret" }] });
		await expect(
			probeIdentity(
				"granola_mcp",
				connectorMethod(requireConnector("granola_mcp")),
				"mcp-test",
			),
		).rejects.toThrow('{"data":[{"account":"string","secret":"string"}]}');
	});

	test("granola_mcp asks the authorization server's userinfo endpoint", async () => {
		const calls = respond({
			sub: "user_01",
			email: "h@tegon.ai",
			name: "Harshith",
		});

		const identity = await probeIdentity(
			"granola_mcp",
			connectorMethod(requireConnector("granola_mcp")),
			"mcp-test",
		);

		expect(calls).toEqual([
			{
				url: "https://mcp-auth.granola.ai/oauth2/userinfo",
				method: "POST",
				auth: "Bearer mcp-test",
			},
		]);
		expect(identity.account).toEqual({ id: "user_01", label: "h@tegon.ai" });
		expect(identity.user).toEqual({ id: "user_01", label: "Harshith" });
	});

	test("circleback_mcp reads the user behind the token", async () => {
		const calls = respond({ id: 42, email: "h@tegon.ai" });

		const identity = await probeIdentity(
			"circleback_mcp",
			connectorMethod(requireConnector("circleback_mcp")),
			"cb-test",
		);

		expect(calls).toEqual([
			{
				url: "https://circleback.ai/api/user",
				method: "GET",
				auth: "Bearer cb-test",
			},
		]);
		expect(identity.account).toEqual({ id: "42", label: "h@tegon.ai" });
		expect(identity.user).toEqual({ id: "42", label: "h@tegon.ai" });
	});

	test("vercel_mcp asks the authorization server's userinfo endpoint", async () => {
		const calls = respond({
			sub: "user_abc",
			email: "h@tegon.ai",
			preferred_username: "harshith",
		});

		const identity = await probeIdentity(
			"vercel_mcp",
			connectorMethod(requireConnector("vercel_mcp")),
			"vc-test",
		);

		expect(calls).toEqual([
			{
				url: "https://api.vercel.com/login/oauth/userinfo",
				method: "GET",
				auth: "Bearer vc-test",
			},
		]);
		expect(identity.account).toEqual({ id: "user_abc", label: "h@tegon.ai" });
		expect(identity.user).toEqual({ id: "user_abc", label: "harshith" });
	});

	test("superhuman_mcp reads the default account wherever the server lists it", async () => {
		const calls: { method?: string; params?: { name?: string } }[] = [];
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			const body = init.body
				? (JSON.parse(String(init.body)) as {
						id?: number;
						method?: string;
						params?: { name?: string };
					})
				: {};
			calls.push({ method: body.method, params: body.params });
			if (init.method === "DELETE") return new Response(null, { status: 204 });
			if (body.id === undefined) return new Response(null, { status: 202 });
			const result =
				body.method === "tools/call"
					? {
							content: [
								{
									type: "text",
									text: JSON.stringify({
										accounts: [
											{
												accountEmail: "personal@example.com",
												isPrimary: false,
												addedAt: "2026-09-01T00:00:00Z",
											},
											{
												accountEmail: "h@tegon.ai",
												isPrimary: true,
												addedAt: "2026-08-13T19:55:57Z",
											},
										],
									}),
								},
							],
						}
					: {
							protocolVersion: "2025-06-18",
							serverInfo: { name: "Superhuman Mail" },
						};
			return new Response(
				JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
				{
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"mcp-session-id": "sess-sh",
					},
				},
			);
		}) as unknown as typeof fetch;

		const identity = await probeIdentity(
			"superhuman_mcp",
			connectorMethod(requireConnector("superhuman_mcp")),
			"sh-test",
		);

		expect(calls.map((c) => c.method ?? "[DELETE]")).toEqual([
			"initialize",
			"notifications/initialized",
			"tools/call",
			"[DELETE]",
		]);
		expect(calls[2]?.params?.name).toBe("list_accounts");
		expect(identity.account).toEqual({
			id: "h@tegon.ai",
			label: "h@tegon.ai",
		});
		expect(identity.user).toEqual({ id: "h@tegon.ai", label: null });
	});

	test("a url probe reports the status of a non-JSON error body", async () => {
		respond(null, {
			status: 502,
			body: "<html>Bad gateway</html>",
			contentType: "text/html",
		});

		await expect(
			probeIdentity(
				"circleback_mcp",
				connectorMethod(requireConnector("circleback_mcp")),
				"cb-test",
			),
		).rejects.toThrow(/502 <html>Bad gateway/);
	});

	test("a url-less probe without a token response fails loudly", async () => {
		await expect(
			probeIdentity(
				"notion_mcp",
				connectorMethod(requireConnector("notion_mcp")),
				"ntn-test",
			),
		).rejects.toThrow(/token response/);
	});

	test("a probe that returns no account id fails loudly", async () => {
		respond({ team: "Tegon" });
		await expect(
			probeIdentity(
				"slack",
				connectorMethod(requireConnector("slack")),
				"xoxp-test",
			),
		).rejects.toThrow(/returned nothing/);
	});
});

describe("registry invariants", () => {
	test("a user-scoped connector declares where its person id lives", () => {
		for (const slug of CONNECTOR_SLUGS) {
			const connector = getConnector(slug);
			if (!connector) throw new Error(`missing ${slug}`);
			for (const method of connector.methods)
				expect([slug, Boolean(method.identity.user)]).toEqual([
					slug,
					connector.scope === "user",
				]);
		}
	});
});

describe("authorization response issuer (RFC 9207)", () => {
	const discovered = (
		extra: Partial<ResolvedEndpoints> = {},
	): ResolvedEndpoints => ({
		authorizationEndpoint: "https://as.example.com/authorize",
		tokenEndpoint: "https://as.example.com/token",
		clientId: "cid",
		pkce: true,
		issuer: "https://as.example.com",
		...extra,
	});

	test("accepts the issuer that was discovered, ignoring a trailing slash", () => {
		expect(() =>
			assertRespondingIssuer("linear", discovered(), "https://as.example.com/"),
		).not.toThrow();
	});

	test("refuses a code minted by a different authorization server", () => {
		expect(() =>
			assertRespondingIssuer(
				"linear",
				discovered(),
				"https://evil.example.com",
			),
		).toThrow(IssuerMismatchError);
	});

	test("refuses a missing iss when the server said it sends one", () => {
		expect(() =>
			assertRespondingIssuer(
				"linear",
				discovered({ issuerParameterSupported: true }),
				null,
			),
		).toThrow(IssuerMismatchError);
	});

	test("allows a missing iss when the server never advertised it", () => {
		expect(() =>
			assertRespondingIssuer("linear", discovered(), null),
		).not.toThrow();
	});

	test("has nothing to check for a static client with no discovered issuer", () => {
		expect(() =>
			assertRespondingIssuer(
				"slack",
				discovered({ issuer: undefined }),
				"https://evil.example.com",
			),
		).not.toThrow();
	});
});

describe("authorizeUrl for a dynamic client", () => {
	const realFetch = globalThis.fetch;
	const realBase = process.env.PLUGIN_CLIENT_METADATA_BASE_URL;

	beforeEach(() => {
		process.env.PLUGIN_CLIENT_METADATA_BASE_URL = "https://api.test";
		const routes: Record<string, unknown> = {
			"https://mcp.granola.ai/.well-known/oauth-protected-resource/mcp": {
				resource: "https://mcp.granola.ai/mcp",
				authorization_servers: ["https://mcp-auth.granola.ai"],
			},
			"https://mcp-auth.granola.ai/.well-known/oauth-authorization-server": {
				issuer: "https://mcp-auth.granola.ai",
				authorization_endpoint: "https://mcp-auth.granola.ai/oauth2/authorize",
				token_endpoint: "https://mcp-auth.granola.ai/oauth2/token",
				code_challenge_methods_supported: ["S256"],
				client_id_metadata_document_supported: true,
			},
			"https://mcp.mail.superhuman.com/.well-known/oauth-protected-resource/mcp":
				{
					resource: "https://mcp.mail.superhuman.com/mcp",
					authorization_servers: ["https://mcp.auth.mail.superhuman.com"],
				},
			"https://mcp.auth.mail.superhuman.com/.well-known/oauth-authorization-server":
				{
					issuer: "https://mcp.auth.mail.superhuman.com",
					authorization_endpoint:
						"https://mcp.auth.mail.superhuman.com/oauth2/authorize",
					token_endpoint: "https://mcp.auth.mail.superhuman.com/oauth2/token",
					code_challenge_methods_supported: ["S256"],
					client_id_metadata_document_supported: true,
				},
		};
		globalThis.fetch = (async (input: string | URL) => {
			const route = routes[String(input)];
			if (route === undefined) return new Response("no route", { status: 404 });
			return new Response(JSON.stringify(route), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
		if (realBase === undefined)
			delete process.env.PLUGIN_CLIENT_METADATA_BASE_URL;
		else process.env.PLUGIN_CLIENT_METADATA_BASE_URL = realBase;
	});

	test("granola_mcp names the resource and asks for its scopes", async () => {
		const url = await authorize("granola_mcp");

		expect(`${url.origin}${url.pathname}`).toBe(
			"https://mcp-auth.granola.ai/oauth2/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(
			"https://api.test/api/connectors/granola_mcp/client-metadata",
		);
		expect(url.searchParams.get("resource")).toBe("https://mcp.granola.ai/mcp");
		expect(url.searchParams.get("scope")).toBe(
			"mcp openid email profile offline_access",
		);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});

	test("superhuman_mcp names the resource and asks for the OIDC scopes", async () => {
		const url = await authorize("superhuman_mcp");

		expect(`${url.origin}${url.pathname}`).toBe(
			"https://mcp.auth.mail.superhuman.com/oauth2/authorize",
		);
		expect(url.searchParams.get("client_id")).toBe(
			"https://api.test/api/connectors/superhuman_mcp/client-metadata",
		);
		expect(url.searchParams.get("resource")).toBe(
			"https://mcp.mail.superhuman.com/mcp",
		);
		expect(url.searchParams.get("scope")).toBe(
			"openid email profile offline_access",
		);
	});
});

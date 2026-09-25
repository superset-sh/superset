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
	GOOGLE_CLIENT_ID: "gc",
	GOOGLE_CLIENT_SECRET: "gs",
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

	const respond = (payload: unknown) => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as typeof fetch;
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

import { expect, test } from "bun:test";
import { getAuthentikConfig } from "./optional-providers";

test("Authentik requires complete configuration", () => {
	expect(getAuthentikConfig({})).toEqual([]);
	expect(
		getAuthentikConfig({
			AUTHENTIK_ISSUER: "https://sso.example.com/application/o/superset/",
			AUTHENTIK_CLIENT_ID: "id",
		}),
	).toEqual([]);
});
test("Authentik discovery retains issuer path and enables PKCE", () => {
	expect(
		getAuthentikConfig({
			AUTHENTIK_ISSUER: "https://sso.example.com/application/o/superset/",
			AUTHENTIK_CLIENT_ID: "id",
			AUTHENTIK_CLIENT_SECRET: "secret",
		}),
	).toEqual([
		{
			providerId: "authentik",
			clientId: "id",
			clientSecret: "secret",
			discoveryUrl:
				"https://sso.example.com/application/o/superset/.well-known/openid-configuration",
			scopes: ["openid", "profile", "email"],
			pkce: true,
		},
	]);
});
test("Authentik rejects whitespace-only credentials without trimming a meaningful secret", () => {
	const complete = {
		AUTHENTIK_ISSUER: "https://id.example.test/application/o/app",
		AUTHENTIK_CLIENT_ID: "client",
		AUTHENTIK_CLIENT_SECRET: " secret ",
	};
	for (const key of ["AUTHENTIK_CLIENT_ID", "AUTHENTIK_CLIENT_SECRET"])
		expect(getAuthentikConfig({ ...complete, [key]: "  " })).toEqual([]);
	expect(getAuthentikConfig(complete)[0]?.clientSecret).toBe(" secret ");
});

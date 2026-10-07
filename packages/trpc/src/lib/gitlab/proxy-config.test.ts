import { expect, test } from "bun:test";
import {
	resolveGitlabSandboxForwardURL,
	resolveGitlabSandboxProxyConfig,
} from "./proxy-config";

const settings = {
	GITLAB_SANDBOX_OIDC_ISSUER: "https://oidc.vercel.com/owned-team",
	VERCEL_SANDBOX_TOKEN: "OWNED_FAKE_SANDBOX_TOKEN",
	VERCEL_SANDBOX_TEAM_ID: "team_owned",
	VERCEL_SANDBOX_PROJECT_ID: "prj_owned",
	NEXT_PUBLIC_API_URL: "https://api.example.com",
};

test("explicit issuer and existing provider identity produce a fixed API audience without credentials", () => {
	expect(resolveGitlabSandboxProxyConfig(settings)).toEqual({
		issuer: settings.GITLAB_SANDBOX_OIDC_ISSUER,
		teamId: "team_owned",
		projectId: "prj_owned",
		forwardURL: "https://api.example.com/api/gitlab/proxy",
	});
	expect(
		JSON.stringify(resolveGitlabSandboxProxyConfig(settings)),
	).not.toContain(settings.VERCEL_SANDBOX_TOKEN);
});

test("operator endpoint canonicalizes HTTPS 443 independently of API origin", () => {
	expect(
		resolveGitlabSandboxForwardURL({
			proxyURL: "https://BROKER.example.com:443/owned/proxy/",
			apiURL: "http://localhost:3001",
		}),
	).toBe("https://broker.example.com/owned/proxy");
	expect(
		resolveGitlabSandboxProxyConfig({
			...settings,
			GITLAB_SANDBOX_PROXY_URL: "https://broker.example.com/proxy",
			NEXT_PUBLIC_API_URL: undefined,
		})?.forwardURL,
	).toBe("https://broker.example.com/proxy");
});

test("empty optional endpoint retains fallback while base API root is validated", () => {
	expect(
		resolveGitlabSandboxForwardURL({
			proxyURL: "",
			apiURL: "https://api.example.com:443/",
		}),
	).toBe("https://api.example.com/api/gitlab/proxy");
	for (const apiURL of [
		undefined,
		"",
		"http://localhost:3001",
		"https://api.example.com/base",
		"https://api.example.com/?x=1",
	])
		expect(resolveGitlabSandboxForwardURL({ apiURL })).toBeNull();
});

for (const [field, values] of Object.entries({
	GITLAB_SANDBOX_OIDC_ISSUER: [
		undefined,
		"",
		"https://oidc.vercel.com",
		"https://oidc.vercel.com/team_owned",
		"https://oidc.vercel.com/owned-team/",
		"https://other.example.com/owned-team",
		"https://oidc.vercel.com/owned-team?x=1",
		" https://oidc.vercel.com/owned-team",
		"https://oidc.vercel.com/owned%2Dteam",
	],
	VERCEL_SANDBOX_TOKEN: [
		undefined,
		"",
		"\tprivate",
		"private token",
		"x".repeat(16385),
	],
	VERCEL_SANDBOX_TEAM_ID: [
		undefined,
		"",
		"team/other",
		"team owned",
		"x".repeat(257),
	],
	VERCEL_SANDBOX_PROJECT_ID: [
		undefined,
		"",
		"prj/other",
		"prj owned",
		"x".repeat(257),
	],
})) {
	test(`missing or malformed ${field} disables broker without inferring trust`, () => {
		for (const value of values)
			expect(
				resolveGitlabSandboxProxyConfig({ ...settings, [field]: value }),
			).toBeNull();
	});
}

for (const proxyURL of [
	"http://broker.example.com/proxy",
	"https://broker.example.com:8443/proxy",
	"https://user@broker.example.com/proxy",
	"https://@broker.example.com/proxy",
	"https://broker.example.com/proxy?x=1",
	"https://broker.example.com/proxy#x",
	"https://broker.example.com/a/../proxy",
	"https://broker.example.com/%2e%2e/proxy",
	"https://broker.example.com/proxy%2Fother",
	"https://broker.example.com//proxy",
	"https://broker.example.com\\@foreign.example.com/proxy",
	"https://bro\tker.example.com/proxy",
	"https://broker.example.com/ pro xy",
	"https://127.0.0.1/proxy",
	"https://[::1]/proxy",
	"https://2130706433/proxy",
	"https://0x7f000001/proxy",
	"https://-broker.example.com/proxy",
	"https://broker.example.com./proxy",
	"https://broker..example.com/proxy",
]) {
	test(`reject endpoint ambiguity ${JSON.stringify(proxyURL)}`, () => {
		expect(
			resolveGitlabSandboxForwardURL({
				proxyURL,
				apiURL: settings.NEXT_PUBLIC_API_URL,
			}),
		).toBeNull();
		expect(
			resolveGitlabSandboxProxyConfig({
				...settings,
				GITLAB_SANDBOX_PROXY_URL: proxyURL,
			}),
		).toBeNull();
	});
}

import { expect, test } from "bun:test";
import { getGitlabProvider } from "./optional-providers";

test("GitLab registration needs both credentials and no self-host configuration", () => {
	expect(getGitlabProvider({})).toEqual({});
	expect(getGitlabProvider({ GITLAB_CLIENT_ID: "id" })).toEqual({});
	expect(
		getGitlabProvider({
			GITLAB_CLIENT_ID: "id",
			GITLAB_CLIENT_SECRET: "secret",
		}),
	).toEqual({ gitlab: { clientId: "id", clientSecret: "secret" } });
});
test("GitLab preserves a configured issuer including HTTPS port", () => {
	expect(
		getGitlabProvider({
			GITLAB_CLIENT_ID: "id",
			GITLAB_CLIENT_SECRET: "secret",
			GITLAB_ISSUER: "https://gitlab.example.com:8443",
		}),
	).toEqual({
		gitlab: {
			clientId: "id",
			clientSecret: "secret",
			issuer: "https://gitlab.example.com:8443",
		},
	});
});
test("the real GitLab SDK uses the issuer and caller callback", async () => {
	const { gitlab } = await import("better-auth/social-providers");
	const config = getGitlabProvider({
		GITLAB_CLIENT_ID: "id",
		GITLAB_CLIENT_SECRET: "secret",
		GITLAB_ISSUER: "https://gitlab.example.com:8443",
	});
	if (!config.gitlab) throw new Error("GitLab was not registered");
	const url = await gitlab(config.gitlab).createAuthorizationURL({
		state: "state",
		codeVerifier: "verifier",
		redirectURI: "https://api.example.com/api/auth/callback/gitlab",
	});
	expect(url.origin).toBe("https://gitlab.example.com:8443");
	expect(url.pathname).toBe("/oauth/authorize");
	expect(url.searchParams.get("redirect_uri")).toBe(
		"https://api.example.com/api/auth/callback/gitlab",
	);
	expect(url.searchParams.get("state")).toBe("state");
});

test("GitLab rejects whitespace-only credentials while retaining meaningful original bytes", () => {
	const complete = {
		GITLAB_CLIENT_ID: " client ",
		GITLAB_CLIENT_SECRET: " secret ",
		GITLAB_ISSUER: "https://git.fixture.test:8443",
	};
	for (const key of ["GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"])
		expect(getGitlabProvider({ ...complete, [key]: "  " })).toEqual({});
	expect(getGitlabProvider(complete)).toEqual({
		gitlab: {
			clientId: " client ",
			clientSecret: " secret ",
			issuer: "https://git.fixture.test:8443",
		},
	});
});

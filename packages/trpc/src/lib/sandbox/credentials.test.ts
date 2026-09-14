import { describe, expect, test } from "bun:test";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import { deriveSandboxCredentials, gitAuthorFor } from "./credentials";

type Policy = {
	allow: Record<
		string,
		Array<{ transform: Array<{ headers: Record<string, string> }> }>
	>;
};
const rules = (
	policy: ReturnType<typeof deriveSandboxCredentials>["networkPolicy"],
) => (policy as Policy).allow;

const author = { name: "Ada", email: "ada@example.com" };

describe("deriveSandboxCredentials", () => {
	test("an organization key becomes a header rule and a placeholder", () => {
		const { networkPolicy, managedEnv } = deriveSandboxCredentials({
			environmentEnv: { FOO: "bar", ANTHROPIC_API_KEY: "sk-org" },
			userAgentEnv: {},
			githubToken: null,
			gitAuthor: author,
		});
		expect(
			rules(networkPolicy)["api.anthropic.com"]?.[0]?.transform[0]?.headers,
		).toEqual({ "x-api-key": "sk-org" });
		expect(rules(networkPolicy)["*"]).toEqual([]);
		expect(managedEnv.ANTHROPIC_API_KEY).toBe(SANDBOX_CREDENTIAL_PLACEHOLDER);
		expect(managedEnv.FOO).toBe("bar");
		expect(JSON.stringify(managedEnv)).not.toContain("sk-org");
	});

	test("the person's own sign-in beats the environment's key", () => {
		const { networkPolicy, managedEnv } = deriveSandboxCredentials({
			environmentEnv: { ANTHROPIC_API_KEY: "sk-org" },
			userAgentEnv: { CLAUDE_CODE_OAUTH_TOKEN: "oat-mine" },
			githubToken: null,
			gitAuthor: author,
		});
		expect(
			rules(networkPolicy)["api.anthropic.com"]?.[0]?.transform[0]?.headers,
		).toEqual({ Authorization: "Bearer oat-mine" });
		expect(managedEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe(
			SANDBOX_CREDENTIAL_PLACEHOLDER,
		);
		expect(managedEnv.ANTHROPIC_API_KEY).toBeUndefined();
	});

	test("the GitHub installation token is a rule for git and the API, never a value on the box", () => {
		const { networkPolicy, managedEnv } = deriveSandboxCredentials({
			environmentEnv: {},
			userAgentEnv: {},
			githubToken: "ghs_token",
			gitAuthor: author,
		});
		const basic = Buffer.from("x-access-token:ghs_token").toString("base64");
		expect(
			rules(networkPolicy)["github.com"]?.[0]?.transform[0]?.headers,
		).toEqual({ Authorization: `Basic ${basic}` });
		expect(
			rules(networkPolicy)["api.github.com"]?.[0]?.transform[0]?.headers,
		).toEqual({ Authorization: "Bearer ghs_token" });
		expect(
			rules(networkPolicy)["uploads.github.com"]?.[0]?.transform[0]?.headers,
		).toEqual({ Authorization: "Bearer ghs_token" });
		expect(managedEnv.GH_TOKEN).toBe(SANDBOX_CREDENTIAL_PLACEHOLDER);
		expect(JSON.stringify(managedEnv)).not.toContain("ghs_token");
	});

	test("a brokered key in the environment's variables never reaches the managed set as itself", () => {
		const { managedEnv } = deriveSandboxCredentials({
			environmentEnv: {
				GH_TOKEN: "leaked",
				OPENAI_API_KEY: "sk-openai",
				OPENAI_BASE_URL: "https://proxy.example",
			},
			userAgentEnv: {},
			githubToken: null,
			gitAuthor: author,
		});
		expect(managedEnv.GH_TOKEN).toBeUndefined();
		expect(managedEnv.OPENAI_API_KEY).toBe(SANDBOX_CREDENTIAL_PLACEHOLDER);
		expect(managedEnv.OPENAI_BASE_URL).toBe("https://proxy.example");
	});

	test("commits on the box are by the given author", () => {
		const { managedEnv } = deriveSandboxCredentials({
			environmentEnv: { GIT_AUTHOR_NAME: "someone else" },
			userAgentEnv: {},
			githubToken: null,
			gitAuthor: author,
		});
		expect(managedEnv.GIT_AUTHOR_NAME).toBe("Ada");
		expect(managedEnv.GIT_COMMITTER_EMAIL).toBe("ada@example.com");
	});
});

describe("gitAuthorFor", () => {
	test("a connected GitHub account commits under its no-reply address", () => {
		expect(
			gitAuthorFor({
				github: { id: "583231", login: "octocat", name: "The Octocat" },
				user: { name: "Ada", email: "ada@example.com" },
			}),
		).toEqual({
			name: "The Octocat",
			email: "583231+octocat@users.noreply.github.com",
		});
	});

	test("a GitHub account without a display name uses its login", () => {
		expect(
			gitAuthorFor({
				github: { id: "1", login: "octocat", name: null },
				user: { name: "Ada", email: "ada@example.com" },
			}).name,
		).toBe("octocat");
	});

	test("without a connected account, the Superset account's name and email", () => {
		expect(
			gitAuthorFor({
				github: null,
				user: { name: "Ada", email: "ada@example.com" },
			}),
		).toEqual({ name: "Ada", email: "ada@example.com" });
	});
});

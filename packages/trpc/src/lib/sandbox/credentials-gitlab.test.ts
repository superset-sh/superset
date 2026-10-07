import { afterEach, describe, expect, mock, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";

const environment = {
	NEXT_PUBLIC_API_URL: "",
	SANDBOX_GATE_SECRET: "fake-gateway-secret-not-a-production-secret",
};
mock.module("../../env", () => ({ env: environment }));
const { deriveSandboxCredentials } = await import("./credentials");
const inputs = {
	workspaceId: "11111111-2222-4333-8444-555555555555",
	environmentEnv: {},
	userAgentEnv: {},
	githubToken: null,
	gitAuthor: { name: "Ada", email: "ada@example.com" },
	gitlabForward: {
		origin: "https://gitlab.example.com",
		forwardURL: "https://broker.example.com/gitlab",
	},
};
afterEach(() => {
	environment.NEXT_PUBLIC_API_URL = "";
});

describe("GitLab cloud credential forwarding", () => {
	const nativeGlab =
		process.env.TEST_GITLAB_CLOUD_GLAB === "1" ? test : test.skip;
	nativeGlab(
		"the installed glab resolves the managed placeholder and exact API authority",
		async () => {
			const directory = await mkdtemp(
				join(tmpdir(), "superset-glab-forwarding-"),
			);
			try {
				const run = promisify(execFile);
				const base = {
					PATH: process.env.PATH,
					HOME: directory,
					GLAB_CONFIG_DIR: directory,
				};
				const old = await run("glab", ["config", "get", "token"], {
					cwd: directory,
					env: { ...base, GLAB_TOKEN: "fake-legacy-placeholder" },
					timeout: 5000,
				});
				expect(old.stdout.trim()).toBe("");
				const { managedEnv } = await deriveSandboxCredentials(inputs);
				for (const [key, expected] of [
					["token", SANDBOX_CREDENTIAL_PLACEHOLDER],
					["host", "gitlab.example.com"],
					["api_host", "gitlab.example.com"],
					["api_protocol", "https"],
					["git_protocol", "https"],
				]) {
					const result = await run("glab", ["config", "get", key ?? ""], {
						cwd: directory,
						env: { ...base, ...managedEnv },
						timeout: 5000,
					});
					expect(result.stdout.trim()).toBe(expected);
				}
			} finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	);
	test("forwards the entire selected domain without injecting an organization token", async () => {
		const result = await deriveSandboxCredentials(inputs);
		expect(result.networkPolicy).toEqual({
			allow: {
				"gitlab.example.com": [
					{ forwardURL: "https://broker.example.com/gitlab" },
				],
				"*": [],
			},
		});
		expect(result.managedEnv.GITLAB_TOKEN).toBe(SANDBOX_CREDENTIAL_PLACEHOLDER);
		expect(result.managedEnv.GITLAB_HOST).toBe("gitlab.example.com");
		expect(result.managedEnv.GITLAB_API_HOST).toBe("gitlab.example.com");
		expect(result.managedEnv.GLAB_API_PROTOCOL).toBe("https");
		expect(result.managedEnv.GLAB_GIT_PROTOCOL).toBe("https");
	});

	test("removes every supported GitLab environment token before adding a placeholder", async () => {
		const aliases = {
			GLAB_TOKEN: "fake-glab-private",
			GITLAB_TOKEN: "fake-gitlab-private",
			GITLAB_ACCESS_TOKEN: "fake-access-private",
			OAUTH_TOKEN: "fake-oauth-private",
		};
		for (const gitlabForward of [inputs.gitlabForward, undefined]) {
			const result = await deriveSandboxCredentials({
				...inputs,
				gitlabForward,
				environmentEnv: { ...aliases, APP_NAME: "demo" },
			});
			for (const value of Object.values(aliases))
				expect(JSON.stringify(result)).not.toContain(value);
			expect(result.managedEnv.APP_NAME).toBe("demo");
		}
	});

	for (const origin of [
		"http://gitlab.example.com",
		"https://gitlab.example.com:8443",
		"https://user:pass@gitlab.example.com",
		"https://gitlab.example.com/group",
		"https://gitlab.example.com?x=1",
		"https://gitlab.example.com#x",
		"https://127.0.0.1",
		"https://[::1]",
		"https://gitlab.example.com.",
		"https://*.example.com",
		"https://gitlab.example.com\\evil",
		"https://@gitlab.example.com",
		"https://%67itlab.example.com",
	])
		test(`rejects unsupported cloud GitLab origin ${origin}`, async () => {
			await expect(
				deriveSandboxCredentials({
					...inputs,
					gitlabForward: { ...inputs.gitlabForward, origin },
				}),
			).rejects.toThrow("Invalid GitLab cloud forwarding configuration");
		});

	for (const forwardURL of [
		"http://broker.example.com/gitlab",
		"https://broker.example.com:8443/gitlab",
		"https://user:pass@broker.example.com/gitlab",
		"https://broker.example.com/gitlab?x=1",
		"https://broker.example.com/gitlab#x",
		"https://broker.example.com/a/../gitlab",
		"https://broker.example.com/%2e%2e/gitlab",
		"https://127.0.0.1/gitlab",
		"https://gitlab.example.com/gitlab",
		"https://broker.example.com./gitlab",
		"https://broker.example.com/gitlab\\evil",
		"https://broker.example.com/gitlab\n",
		"https://bro\tker.example.com/gitlab",
		"https://broker.example.com\n/gitlab",
		"https://broker.example.com\\evil/gitlab",
		"https://@broker.example.com/gitlab",
		"https://%62roker.example.com/gitlab",
	])
		test(`rejects invalid or recursive broker ${forwardURL}`, async () => {
			await expect(
				deriveSandboxCredentials({
					...inputs,
					gitlabForward: { ...inputs.gitlabForward, forwardURL },
				}),
			).rejects.toThrow("Invalid GitLab cloud forwarding configuration");
		});

	test("rejects a GitLab domain occupied by another credential rule", async () => {
		for (const userAgentEnv of [
			{
				OPENAI_API_KEY: "fake-model",
				OPENAI_BASE_URL: inputs.gitlabForward.origin,
			},
			{
				ANTHROPIC_API_KEY: "fake-model",
				ANTHROPIC_BASE_URL: inputs.gitlabForward.origin,
			},
		])
			await expect(
				deriveSandboxCredentials({ ...inputs, userAgentEnv }),
			).rejects.toThrow(
				"GitLab cloud forwarding conflicts with another service",
			);
		environment.NEXT_PUBLIC_API_URL = inputs.gitlabForward.origin;
		await expect(deriveSandboxCredentials(inputs)).rejects.toThrow(
			"GitLab cloud forwarding conflicts with another service",
		);
	});

	for (const host of ["github.com", "api.github.com", "uploads.github.com"])
		test(`rejects reserved GitHub authority ${host}`, async () => {
			await expect(
				deriveSandboxCredentials({
					...inputs,
					gitlabForward: { ...inputs.gitlabForward, origin: `https://${host}` },
				}),
			).rejects.toThrow(
				"GitLab cloud forwarding conflicts with another service",
			);
		});

	test("retains GitHub and model rules when a distinct GitLab domain is added", async () => {
		const all = {
			...inputs,
			githubToken: "fake-gh-token",
			userAgentEnv: { OPENAI_API_KEY: "fake-model" },
		};
		const unchanged = await deriveSandboxCredentials({
			...all,
			gitlabForward: undefined,
		});
		const forwarded = await deriveSandboxCredentials(all);
		const expected = structuredClone(unchanged.networkPolicy);
		if (
			typeof expected === "string" ||
			!expected.allow ||
			Array.isArray(expected.allow)
		)
			throw new Error("Fixture expected a domain policy");
		expected.allow["gitlab.example.com"] = [
			{ forwardURL: inputs.gitlabForward.forwardURL },
		];
		expect(forwarded.networkPolicy).toEqual(expected);
	});
});

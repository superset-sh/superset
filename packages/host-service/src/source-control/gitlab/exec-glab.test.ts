import { describe, expect, test } from "bun:test";
import {
	configuredGitLabOrigins,
	configuredGitLabSshHosts,
	environmentForGitLabInstance,
	execGlab,
	GitLabError,
	type GlabRunnerOptions,
} from "./exec-glab";

describe("GitLab CLI transport", () => {
	test("reads an explicitly configured self-managed origin", () => {
		expect(
			configuredGitLabOrigins({
				GITLAB_HOST: "code.example.com:8443",
				GLAB_API_PROTOCOL: "http",
			}),
		).toEqual(["http://code.example.com:8443"]);
		expect(
			configuredGitLabOrigins({ GITLAB_HOST: "code.example.com/path" }),
		).toEqual([]);
		expect(
			configuredGitLabOrigins({ GITLAB_HOST: "code.example.com?other=1" }),
		).toEqual([]);
		expect(
			configuredGitLabSshHosts({
				GITLAB_HOST: "code.example.com:8443",
				GITLAB_SSH_HOST: "ssh.example.com",
			}),
		).toEqual([
			{
				sshHost: "ssh.example.com",
				instance: "https://code.example.com:8443",
			},
		]);
	});

	test("selects the instance and sends an explicit GET with bounded output", async () => {
		let received: { args: string[]; options: GlabRunnerOptions } | undefined;
		const result = await execGlab({
			instance: "https://gitlab.example.com:8443",
			endpoint: "projects/team%2Frepo/issues",
			fields: { state: "opened", page: 2 },
			env: {
				PATH: "/bin",
				GITLAB_HOST: "gitlab.example.com:8443",
				GITLAB_TOKEN: "token-a",
			},
			runner: async (args, options) => {
				received = { args, options };
				return { stdout: "[]", stderr: "" };
			},
		});
		expect(result).toEqual([]);
		expect(received?.args).toEqual([
			"api",
			"projects/team%2Frepo/issues?state=opened&page=2",
			"--hostname",
			"gitlab.example.com:8443",
			"--method",
			"GET",
		]);
		expect(received?.options.timeout).toBe(15_000);
		expect(received?.options.maxBuffer).toBe(10 * 1024 * 1024);
		expect(received?.options.env.GITLAB_TOKEN).toBe("token-a");
	});

	test("does not forward credentials or endpoint overrides to another instance", () => {
		const env = environmentForGitLabInstance(
			{
				GITLAB_HOST: "one.example.com",
				GITLAB_URI: "three.example.com",
				GL_HOST: "four.example.com",
				GITLAB_TOKEN: "token-a",
				GITLAB_ACCESS_TOKEN: "token-b",
				OAUTH_TOKEN: "token-c",
				GITLAB_API_HOST: "api.one.example.com",
				GITLAB_SUBFOLDER: "other-installation",
				GLAB_DEBUG_HTTP: "1",
				GITLAB_CI: "true",
				CI_SERVER_FQDN: "ci.example.com",
				CI_JOB_TOKEN: "job-token",
			},
			"https://two.example.com",
		);
		expect(env.GITLAB_HOST).toBe("two.example.com");
		expect(env.GITLAB_TOKEN).toBeUndefined();
		expect(env.GITLAB_ACCESS_TOKEN).toBeUndefined();
		expect(env.OAUTH_TOKEN).toBeUndefined();
		expect(env.GITLAB_API_HOST).toBeUndefined();
		expect(env.GITLAB_URI).toBeUndefined();
		expect(env.GL_HOST).toBeUndefined();
		expect(env.GITLAB_SUBFOLDER).toBeUndefined();
		expect(env.GLAB_DEBUG_HTTP).toBeUndefined();
		expect(env.GITLAB_CI).toBeUndefined();
		expect(env.CI_SERVER_FQDN).toBeUndefined();
		expect(env.CI_JOB_TOKEN).toBeUndefined();
	});

	test("scopes tokens to the configured protocol and accepts explicit host aliases", () => {
		const environment = {
			GITLAB_URI: "code.example.com:8443",
			GLAB_API_PROTOCOL: "http",
			GITLAB_TOKEN: "token-a",
		};
		expect(configuredGitLabOrigins(environment)).toEqual([
			"http://code.example.com:8443",
		]);
		expect(
			environmentForGitLabInstance(environment, "http://code.example.com:8443")
				.GITLAB_TOKEN,
		).toBe("token-a");
		expect(
			environmentForGitLabInstance(environment, "https://code.example.com:8443")
				.GITLAB_TOKEN,
		).toBeUndefined();
	});

	test("passes mutation fields through stdin, including @-prefixed text", async () => {
		let received: { args: string[]; options: GlabRunnerOptions } | undefined;
		await execGlab({
			instance: "https://gitlab.com",
			endpoint: "projects/7/issues",
			method: "POST",
			fields: { title: "@not-a-file" },
			env: { PATH: "/bin" },
			runner: async (args, options) => {
				received = { args, options };
				return { stdout: "{}", stderr: "" };
			},
		});
		expect(received?.args).toContain("--input");
		expect(received?.options.input).toBe('{"title":"@not-a-file"}');
	});

	test("classifies errors without leaking tokens", async () => {
		for (const [message, kind] of [
			["401 Unauthorized token-secret", "REJECTED_CREDENTIAL"],
			["404 Not Found token-secret", "INACCESSIBLE_PROJECT"],
			["409 Conflict token-secret", "CONFLICT"],
			["429 Too Many Requests token-secret", "RATE_LIMIT"],
		] as const) {
			try {
				await execGlab({
					instance: "https://gitlab.com",
					endpoint: "projects/1",
					env: { PATH: "/bin" },
					runner: async () => {
						throw new Error(message);
					},
				});
			} catch (error) {
				expect(error).toBeInstanceOf(GitLabError);
				expect((error as GitLabError).kind).toBe(kind);
				if (kind === "CONFLICT")
					expect((error as GitLabError).statusCode).toBe(409);
				expect((error as Error).message).not.toContain("token-secret");
			}
		}
	});

	test("distinguishes a missing CLI from a missing login", async () => {
		const missingTool = Object.assign(new Error("spawn glab ENOENT"), {
			code: "ENOENT",
		});
		for (const [failure, kind] of [
			[missingTool, "MISSING_TOOL"],
			[new Error("not logged in"), "UNAUTHENTICATED"],
		] as const) {
			try {
				await execGlab({
					instance: "https://gitlab.com",
					endpoint: "projects/1",
					env: { PATH: "/bin" },
					runner: async () => {
						throw failure;
					},
				});
				throw new Error("Expected GitLab CLI failure");
			} catch (error) {
				expect(error).toBeInstanceOf(GitLabError);
				expect((error as GitLabError).kind).toBe(kind);
			}
		}
	});
});

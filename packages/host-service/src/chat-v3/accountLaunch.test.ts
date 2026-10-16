import { describe, expect, test } from "bun:test";
import {
	resolveProviderLaunchAccount,
	withPinnedAccountEnv,
} from "../trpc/router/agents/launch-account";
import type { SessionAccount } from "../trpc/router/usage/session-account/session-account";
import { prepareChatAccount, sessionAccountForChat } from "./accountLaunch";

const account: SessionAccount = {
	agent: "claude",
	selection: "/fixture/claude",
	directory: "/fixture/claude",
	identity: "a".repeat(64),
	credentialKind: "subscription",
	email: "fixture@example.test",
};
const choice = { selection: account.selection, identity: account.identity };

describe("native chat account launch", () => {
	test("validates the selected profile and working folder, without changing a default", async () => {
		const seen: unknown[] = [];
		const selected = await prepareChatAccount(
			{ harness: "claude-acp", account: choice, cwd: "/fixture/work" },
			{
				resolve: async (provider, input) => {
					seen.push({ provider, input });
					return account;
				},
				validateRouting: async (profile, cwd) => {
					seen.push({ profile, cwd });
				},
			},
		);
		expect(seen).toEqual([
			{ provider: "claude", input: choice },
			{ profile: account, cwd: "/fixture/work" },
		]);
		expect(selected).toEqual({
			agent: account.agent,
			...choice,
			directory: account.directory as string,
		});
		expect(sessionAccountForChat(selected)).toMatchObject({
			pinned: true,
			credentialKind: "subscription",
		});
	});

	test("refuses legacy or unknown harnesses before profile discovery", async () => {
		for (const harness of ["claude-code", "codex", "custom"]) {
			await expect(
				prepareChatAccount(
					{ harness, account: choice, cwd: "/fixture/work" },
					{
						resolve: async () => {
							throw new Error("must not discover");
						},
						validateRouting: async () => {},
					},
				),
			).rejects.toThrow("does not support explicit account");
		}
	});

	test("routing or identity failures never select another profile", async () => {
		await expect(
			prepareChatAccount(
				{ harness: "claude-acp", account: choice, cwd: "/fixture/work" },
				{
					resolve: async () => account,
					validateRouting: async () => {
						throw new Error("conflicting routing");
					},
				},
			),
		).rejects.toThrow("conflicting routing");
		await expect(
			resolveProviderLaunchAccount(
				"claude",
				{ ...choice, identity: "b".repeat(64) },
				async () => [account],
			),
		).rejects.toThrow();
	});

	test("pinned Claude overrides inherited default and API auth without mutating ambient env", () => {
		const ambient = {
			SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/wrong",
			CLAUDE_CONFIG_DIR: "/wrong",
			ANTHROPIC_API_KEY: "fixture-key",
			ANTHROPIC_AUTH_TOKEN: "fixture-token",
			ANTHROPIC_CUSTOM_HEADERS: "fixture-header",
			PATH: "/bin",
			CODEX_HOME: "/other-provider",
		};
		const selected = withPinnedAccountEnv(account, ambient);
		expect(selected.CLAUDE_CONFIG_DIR).toBe(account.directory);
		expect(selected.SUPERSET_PINNED_ACCOUNT).toBe("CLAUDE_CONFIG_DIR");
		expect(selected.ANTHROPIC_API_KEY).toBeUndefined();
		expect(selected.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(selected.ANTHROPIC_CUSTOM_HEADERS).toBeUndefined();
		expect(selected.SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR).toBeUndefined();
		expect(selected.CODEX_HOME).toBe("/other-provider");
		expect(ambient.CLAUDE_CONFIG_DIR).toBe("/wrong");
	});

	test("system Claude selection leaves its config override unset; Codex pins its selected home", () => {
		expect(
			withPinnedAccountEnv(
				{ ...account, selection: null },
				{
					CLAUDE_CONFIG_DIR: "/wrong",
					SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR: "/wrong",
				},
			),
		).toEqual({ SUPERSET_PINNED_ACCOUNT: "CLAUDE_CONFIG_DIR" });
		const env = withPinnedAccountEnv(
			{
				...account,
				agent: "codex",
				selection: "/fixture/codex",
				directory: "/fixture/codex",
			},
			{
				CODEX_HOME: "/wrong",
				SUPERSET_DEFAULT_CODEX_HOME: "/wrong",
				OPENAI_API_KEY: "fixture-key",
				OPENAI_BASE_URL: "https://example.test",
			},
		);
		expect(env).toEqual({
			CODEX_HOME: "/fixture/codex",
			SUPERSET_DEFAULT_CODEX_HOME: "/fixture/codex",
			SUPERSET_PINNED_ACCOUNT: "CODEX_HOME",
		});
	});
});

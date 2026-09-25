import { describe, expect, test } from "bun:test";
import { agentCredentialToEnv } from "./agent-credentials";

describe("agentCredentialToEnv", () => {
	test("a Claude gateway key is the bearer variable against the gateway's Claude Code endpoint", () => {
		expect(
			agentCredentialToEnv({
				agent: "claude",
				kind: "api_key",
				value: "vck_1",
				provider: "gateway",
			}),
		).toEqual({
			ANTHROPIC_AUTH_TOKEN: "vck_1",
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/claude-code",
		});
	});

	test("a Codex gateway key is the OpenAI key against the gateway's Codex endpoint", () => {
		expect(
			agentCredentialToEnv({
				agent: "codex",
				kind: "api_key",
				value: "vck_1",
				provider: "gateway",
			}),
		).toEqual({
			OPENAI_API_KEY: "vck_1",
			OPENAI_BASE_URL: "https://ai-gateway.vercel.sh/codex/v1",
		});
	});

	test("a plain Anthropic key keeps x-api-key semantics and its own base URL", () => {
		expect(
			agentCredentialToEnv({
				agent: "claude",
				kind: "api_key",
				value: "sk-ant-1",
				baseUrl: "https://proxy.example.com",
			}),
		).toEqual({
			ANTHROPIC_API_KEY: "sk-ant-1",
			ANTHROPIC_BASE_URL: "https://proxy.example.com",
		});
	});

	test("a Codex subscription has nowhere to go yet", () => {
		expect(
			agentCredentialToEnv({
				agent: "codex",
				kind: "subscription",
				value: "x",
			}),
		).toEqual({});
	});
});

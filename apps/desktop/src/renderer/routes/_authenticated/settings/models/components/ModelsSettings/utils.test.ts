import { describe, expect, it } from "bun:test";
import { buildAnthropicEnvText, parseAnthropicForm } from "./utils";

describe("Anthropic model settings utils", () => {
	it("does not persist credential placeholder text as a real secret", () => {
		expect(
			parseAnthropicForm("ANTHROPIC_AUTH_TOKEN=ANTHROPIC_AUTH_TOKEN"),
		).toMatchObject({
			authToken: "",
		});

		expect(
			buildAnthropicEnvText({
				apiKey: "",
				authToken: "ANTHROPIC_AUTH_TOKEN",
				baseUrl: "https://api.anthropic.com",
				extraEnv: "",
			}),
		).toBe("ANTHROPIC_BASE_URL=https://api.anthropic.com");
	});

	it("removes Bedrock env vars when a direct Anthropic credential is present", () => {
		expect(
			buildAnthropicEnvText({
				apiKey: "sk-ant-api03-test-key",
				authToken: "",
				baseUrl: "https://api.anthropic.com",
				extraEnv:
					"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1\nCUSTOM_ENV=value",
			}),
		).toBe(
			"ANTHROPIC_API_KEY=sk-ant-api03-test-key\nANTHROPIC_BASE_URL=https://api.anthropic.com\nCUSTOM_ENV=value",
		);
	});

	it("keeps Bedrock env vars when no direct Anthropic credential is present", () => {
		expect(
			buildAnthropicEnvText({
				apiKey: "",
				authToken: "",
				baseUrl: "",
				extraEnv: "CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1",
			}),
		).toBe("CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1");
	});
});

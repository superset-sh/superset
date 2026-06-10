import { describe, expect, it } from "bun:test";
import {
	buildAnthropicRuntimeEnv,
	parseAnthropicEnvText,
} from "./anthropic-runtime-env";

describe("host-service Anthropic runtime env", () => {
	it("ignores credential placeholder values", () => {
		expect(
			parseAnthropicEnvText(
				[
					"ANTHROPIC_API_KEY=ANTHROPIC_API_KEY",
					"ANTHROPIC_AUTH_TOKEN=ANTHROPIC_AUTH_TOKEN",
					"ANTHROPIC_BASE_URL=https://api.anthropic.com",
				].join("\n"),
			),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
		});
	});

	it("can suppress Bedrock env vars when direct Anthropic auth is available", () => {
		expect(
			buildAnthropicRuntimeEnv(
				{
					CLAUDE_CODE_USE_BEDROCK: "1",
					AWS_REGION: "us-east-1",
					ANTHROPIC_BASE_URL: "https://api.anthropic.com",
					CUSTOM_ENV: "value",
				},
				{ suppressBedrock: true },
			),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://api.anthropic.com",
			CUSTOM_ENV: "value",
		});
	});
});

import { describe, expect, it } from "bun:test";
import { mergeClaudeSettingsLocalJson } from "./claude-settings";

const env = {
	ANTHROPIC_AUTH_TOKEN: "gateway-token",
	ANTHROPIC_BASE_URL: "http://127.0.0.1:4879/model-gateway",
	API_TIMEOUT_MS: "3000000",
	CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
	ANTHROPIC_MODEL: "gpt-5.5",
	ANTHROPIC_DEFAULT_HAIKU_MODEL: "gpt-5.5-mini",
	ANTHROPIC_DEFAULT_SONNET_MODEL: "gpt-5.5",
	ANTHROPIC_DEFAULT_OPUS_MODEL: "gpt-5.5(xhigh)",
	CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
} as const;

describe("mergeClaudeSettingsLocalJson", () => {
	it("preserves unrelated top-level and env keys", () => {
		const result = mergeClaudeSettingsLocalJson(
			JSON.stringify({
				permissions: { allow: ["Bash(bun test)"] },
				env: {
					KEEP_ME: "yes",
					ANTHROPIC_DEFAULT_SONNET_MODEL: "old",
				},
			}),
			env,
		);

		const parsed = JSON.parse(result.text);
		expect(parsed.permissions).toEqual({ allow: ["Bash(bun test)"] });
		expect(parsed.env.KEEP_ME).toBe("yes");
		expect(parsed.env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe("gpt-5.5");
		expect(result.preservedEnvKeys).toEqual(["KEEP_ME"]);
	});

	it("replaces invalid JSON with a clean object", () => {
		const result = mergeClaudeSettingsLocalJson("{ nope", env);
		const parsed = JSON.parse(result.text);
		expect(result.replacedInvalidJson).toBe(true);
		expect(parsed.env.ANTHROPIC_AUTH_TOKEN).toBe("gateway-token");
	});

	it("replaces non-object env values", () => {
		const result = mergeClaudeSettingsLocalJson(
			JSON.stringify({ env: "bad" }),
			env,
		);
		const parsed = JSON.parse(result.text);
		expect(result.replacedNonObjectEnv).toBe(true);
		expect(parsed.env.ANTHROPIC_BASE_URL).toContain("/model-gateway");
	});
});

import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyAnthropicRuntimeEnv,
	buildAnthropicRuntimeEnv,
	clearAnthropicEnvConfig,
	getAnthropicEnvConfig,
	parseAnthropicEnvText,
	setAnthropicEnvConfig,
} from "./anthropic-env-config";

const MANAGED_ENV_KEYS = [
	"ANTHROPIC_BASE_URL",
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"CLAUDE_CODE_USE_BEDROCK",
	"AWS_REGION",
	"AWS_PROFILE",
	"OPENAI_API_KEY",
] as const;
const originalEnvValues = Object.fromEntries(
	MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof MANAGED_ENV_KEYS)[number], string | undefined>;

afterEach(() => {
	for (const key of MANAGED_ENV_KEYS) {
		const value = originalEnvValues[key];
		if (value !== undefined) {
			process.env[key] = value;
		} else {
			delete process.env[key];
		}
	}
});

describe("parseAnthropicEnvText", () => {
	it("parses valid env vars and ignores comments", () => {
		const variables = parseAnthropicEnvText(
			[
				"# Gateway settings",
				'export ANTHROPIC_BASE_URL="https://ai-gateway.vercel.sh"',
				"ANTHROPIC_AUTH_TOKEN='gw-token'",
				"CLAUDE_CODE_USE_BEDROCK=1",
				"",
			].join("\n"),
		);

		expect(variables).toEqual({
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			ANTHROPIC_AUTH_TOKEN: "gw-token",
			CLAUDE_CODE_USE_BEDROCK: "1",
		});
	});

	it("keeps non-Anthropic variables", () => {
		expect(
			parseAnthropicEnvText(
				[
					"OPENAI_API_KEY=foo",
					"CLAUDE_CODE_USE_BEDROCK=1",
					"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh",
				].join("\n"),
			),
		).toEqual({
			OPENAI_API_KEY: "foo",
			CLAUDE_CODE_USE_BEDROCK: "1",
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
		});
	});

	it("rejects malformed lines", () => {
		expect(() => parseAnthropicEnvText("ANTHROPIC_BASE_URL")).toThrow(
			"Please provide a valid .env block.",
		);
	});
});

describe("Anthropic env config persistence", () => {
	it("persists, loads, and clears config from disk", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "anthropic-env-config-"));
		const configPath = join(tempDir, "chat-anthropic-env.json");

		try {
			setAnthropicEnvConfig(
				{
					envText: "\nANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\n",
				},
				{ configPath },
			);

			const loaded = getAnthropicEnvConfig({ configPath });
			expect(loaded.envText).toBe(
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh",
			);
			expect(loaded.variables).toEqual({
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			});

			const raw = JSON.parse(readFileSync(configPath, "utf-8")) as {
				version: number;
				envText: string;
			};
			expect(raw.version).toBe(1);

			clearAnthropicEnvConfig({ configPath });
			expect(getAnthropicEnvConfig({ configPath })).toEqual({
				envText: "",
				variables: {},
			});
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("keeps non-Anthropic vars when persisting", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "anthropic-env-config-"));
		const configPath = join(tempDir, "chat-anthropic-env.json");

		try {
			setAnthropicEnvConfig(
				{
					envText: [
						"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh",
						"OPENAI_API_KEY=foo",
						"ANTHROPIC_AUTH_TOKEN=gw-token",
						"AWS_REGION=us-east-1",
					].join("\n"),
				},
				{ configPath },
			);

			const loaded = getAnthropicEnvConfig({ configPath });
			expect(loaded.envText).toBe(
				"ANTHROPIC_BASE_URL=https://ai-gateway.vercel.sh\nOPENAI_API_KEY=foo\nANTHROPIC_AUTH_TOKEN=gw-token\nAWS_REGION=us-east-1",
			);
			expect(loaded.variables).toEqual({
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
				OPENAI_API_KEY: "foo",
				ANTHROPIC_AUTH_TOKEN: "gw-token",
				AWS_REGION: "us-east-1",
			});
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("returns empty config when persisted file is invalid JSON", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "anthropic-env-config-"));
		const configPath = join(tempDir, "chat-anthropic-env.json");

		try {
			writeFileSync(configPath, "{not-json", "utf-8");
			expect(getAnthropicEnvConfig({ configPath })).toEqual({
				envText: "",
				variables: {},
			});
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("Anthropic runtime env helpers", () => {
	it("keeps explicit auth token values without synthesizing an API key", () => {
		expect(
			buildAnthropicRuntimeEnv({
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
				ANTHROPIC_AUTH_TOKEN: "gw-token",
			}),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/v1",
			ANTHROPIC_AUTH_TOKEN: "gw-token",
		});
	});

	it("preserves explicit auth variables as provided", () => {
		expect(
			buildAnthropicRuntimeEnv({
				ANTHROPIC_API_KEY: "env-key",
				ANTHROPIC_AUTH_TOKEN: "gw-token",
			}),
		).toEqual({
			ANTHROPIC_API_KEY: "env-key",
			ANTHROPIC_AUTH_TOKEN: "gw-token",
		});
	});

	it("normalizes a gateway base URL without adding auth vars", () => {
		expect(
			buildAnthropicRuntimeEnv({
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			}),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/v1",
		});
	});

	it("keeps an explicit gateway /v1 base URL unchanged", () => {
		expect(
			buildAnthropicRuntimeEnv({
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/v1",
				ANTHROPIC_AUTH_TOKEN: "gw-token",
			}),
		).toEqual({
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/v1",
			ANTHROPIC_AUTH_TOKEN: "gw-token",
		});
	});

	it("sets and clears managed process env keys", () => {
		applyAnthropicRuntimeEnv({
			ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			ANTHROPIC_API_KEY: "api-key",
			ANTHROPIC_AUTH_TOKEN: "token-key",
			CLAUDE_CODE_USE_BEDROCK: "1",
		});

		expect(process.env.ANTHROPIC_BASE_URL).toBe("https://ai-gateway.vercel.sh");
		expect(process.env.ANTHROPIC_API_KEY).toBe("api-key");
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe("token-key");
		expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBe("1");

		applyAnthropicRuntimeEnv(
			{
				ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
			},
			{
				previousRuntimeEnv: {
					ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh",
					ANTHROPIC_API_KEY: "api-key",
					ANTHROPIC_AUTH_TOKEN: "token-key",
					CLAUDE_CODE_USE_BEDROCK: "1",
				},
			},
		);

		expect(process.env.ANTHROPIC_BASE_URL).toBe("https://ai-gateway.vercel.sh");
		expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
		expect(process.env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
	});
});

import { describe, expect, mock, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";

mock.module("@/env", () => ({
	env: { ANTHROPIC_API_KEY: "test-key-not-used" },
}));

mock.module("./mcp-clients", () => ({
	createSupersetMcpClient: () => {
		throw new Error("not used in these tests");
	},
	mcpToolToAnthropicTool: () => {
		throw new Error("not used in these tests");
	},
	parseToolName: () => {
		throw new Error("not used in these tests");
	},
}));

const { formatErrorForSlack } = await import("./run-agent");

function makeRateLimitError(
	headerEntries: Record<string, string>,
): Anthropic.APIError {
	const headers = new Headers(headerEntries);
	return new Anthropic.APIError(
		429,
		{
			type: "error",
			error: { type: "rate_limit_error", message: "rate limited" },
		},
		"rate limited",
		headers,
	);
}

describe("formatErrorForSlack — Anthropic 429 handling", () => {
	test("surfaces Retry-After (seconds) from 429 to the user", async () => {
		const err = makeRateLimitError({ "retry-after": "30" });

		const message = await formatErrorForSlack(err);

		expect(message).toMatch(/30\s*seconds?/i);
	});

	test("surfaces Retry-After (HTTP-date) from 429 to the user", async () => {
		const future = new Date(Date.now() + 90_000).toUTCString();
		const err = makeRateLimitError({ "retry-after": future });

		const message = await formatErrorForSlack(err);

		expect(message).toMatch(/(seconds?|minutes?)/i);
		expect(message).not.toBe(
			"I'm a bit overloaded right now — please try again in a moment.",
		);
	});

	test("surfaces retry-after-ms when present", async () => {
		const err = makeRateLimitError({ "retry-after-ms": "12000" });

		const message = await formatErrorForSlack(err);

		expect(message).toMatch(/12\s*seconds?/i);
	});

	test("falls back to static overload message when no Retry-After header", async () => {
		const err = makeRateLimitError({});

		const message = await formatErrorForSlack(err);

		expect(message).toBe(
			"I'm a bit overloaded right now — please try again in a moment.",
		);
	});
});

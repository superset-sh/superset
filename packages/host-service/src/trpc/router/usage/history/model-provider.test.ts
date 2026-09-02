import { describe, expect, test } from "bun:test";
import { inferModelProvider } from "./model-provider";

describe("inferModelProvider", () => {
	test("keeps direct agents distinct from their model backend", () => {
		expect(inferModelProvider("claude", "claude-opus-5")).toBe("anthropic");
		expect(inferModelProvider("codex", "gpt-5.6")).toBe("openai");
		expect(inferModelProvider("grok", "grok-code-fast-1")).toBe("xai");
		expect(inferModelProvider("cursor", "composer")).toBe("cursor");
	});

	test("attributes multi-model agents from vendor-qualified model ids", () => {
		expect(inferModelProvider("opencode", "anthropic/claude-sonnet-5")).toBe(
			"anthropic",
		);
		expect(inferModelProvider("agy", "gemini-3.1-pro")).toBe("google");
		expect(inferModelProvider("pi", "openai/gpt-5.6")).toBe("openai");
	});
});

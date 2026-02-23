import { describe, expect, it } from "bun:test";
import { buildFallbackSessionContext } from "./fallback-context";

describe("buildFallbackSessionContext", () => {
	it("uses safe defaults when no prior context exists", () => {
		const result = buildFallbackSessionContext({
			defaultModelId: "anthropic/claude-sonnet-4-6",
			cwd: "/repo",
			apiUrl: "https://api.example.com",
		});

		expect(result.modelId).toBe("anthropic/claude-sonnet-4-6");
		expect(result.permissionMode).toBe("default");
		expect(result.thinkingEnabled).toBe(false);
		expect(result.requestEntries).toEqual([
			["modelId", "anthropic/claude-sonnet-4-6"],
			["cwd", "/repo"],
			["apiUrl", "https://api.example.com"],
		]);
	});

	it("preserves known context and carries auth + thinking flags", () => {
		const result = buildFallbackSessionContext({
			defaultModelId: "anthropic/claude-sonnet-4-6",
			cwd: "/repo",
			apiUrl: "https://api.example.com",
			lastKnownModelId: "openai/gpt-4.1",
			lastKnownPermissionMode: "acceptEdits",
			lastKnownThinkingEnabled: true,
			authHeaders: {
				Authorization: "Bearer token",
				"x-custom": "abc",
			},
		});

		expect(result.modelId).toBe("openai/gpt-4.1");
		expect(result.permissionMode).toBe("acceptEdits");
		expect(result.thinkingEnabled).toBe(true);
		expect(result.requestEntries).toContainEqual([
			"authHeaders",
			JSON.stringify({
				Authorization: "Bearer token",
				"x-custom": "abc",
			}),
		]);
		expect(result.requestEntries).toContainEqual(["thinkingEnabled", "true"]);
	});
});

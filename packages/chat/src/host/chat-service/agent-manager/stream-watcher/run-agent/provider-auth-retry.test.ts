import { beforeEach, describe, expect, it, mock } from "bun:test";

const runWithAnthropicOAuthRetry = mock(
	async <T>(operation: () => Promise<T>): Promise<T> => operation(),
);

mock.module("./run-agent-oauth", () => ({
	runWithAnthropicOAuthRetry,
}));

const { resolveModelProvider, runWithProviderAuthRetry } = await import(
	"./provider-auth-retry"
);

beforeEach(() => {
	runWithAnthropicOAuthRetry.mockClear();
});

describe("resolveModelProvider", () => {
	it("returns null for missing model IDs", () => {
		expect(resolveModelProvider(undefined)).toBeNull();
		expect(resolveModelProvider("")).toBeNull();
		expect(resolveModelProvider("   ")).toBeNull();
	});

	it("extracts provider from namespaced model IDs", () => {
		expect(resolveModelProvider("anthropic/claude-sonnet-4-6")).toBe(
			"anthropic",
		);
		expect(resolveModelProvider("OPENAI/gpt-4.1")).toBe("openai");
	});

	it("defaults slash-less model IDs to anthropic", () => {
		expect(resolveModelProvider("claude-sonnet-4-6")).toBe("anthropic");
	});
});

describe("runWithProviderAuthRetry", () => {
	it("uses the default anthropic retry handler", async () => {
		const operation = mock(async () => "ok");

		const result = await runWithProviderAuthRetry(operation, {
			modelId: "anthropic/claude-sonnet-4-6",
		});

		expect(result).toBe("ok");
		expect(runWithAnthropicOAuthRetry).toHaveBeenCalledTimes(1);
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("falls back to direct execution when no handler exists", async () => {
		const operation = mock(async () => "ok");

		const result = await runWithProviderAuthRetry(operation, {
			modelId: "openai/gpt-4.1",
		});

		expect(result).toBe("ok");
		expect(runWithAnthropicOAuthRetry).toHaveBeenCalledTimes(0);
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it("supports injected provider handlers", async () => {
		const operation = mock(async () => "ok");
		const openaiHandler = mock(
			async <T>(runner: () => Promise<T>): Promise<T> => runner(),
		);

		const result = await runWithProviderAuthRetry(operation, {
			modelId: "openai/gpt-4.1",
			handlers: { openai: openaiHandler },
		});

		expect(result).toBe("ok");
		expect(openaiHandler).toHaveBeenCalledTimes(1);
		expect(runWithAnthropicOAuthRetry).toHaveBeenCalledTimes(0);
		expect(operation).toHaveBeenCalledTimes(1);
	});
});

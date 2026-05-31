import { describe, expect, it, mock } from "bun:test";
import { fetchRemoteModelList, parseRemoteModelList } from "./remote-models";

describe("remote model list helpers", () => {
	it("parses OpenAI and Anthropic-style model list responses", () => {
		expect(
			parseRemoteModelList({
				data: [
					{ id: "gpt-5.5", object: "model" },
					{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5" },
					{ id: "gpt-5.5" },
				],
			}),
		).toEqual([
			{ modelId: "gpt-5.5", displayName: "gpt-5.5" },
			{
				modelId: "claude-sonnet-4-5",
				displayName: "Claude Sonnet 4.5",
			},
		]);

		expect(
			parseRemoteModelList({
				models: [{ model: "codex-max" }, "gpt-5.5(xhigh)"],
			}),
		).toEqual([
			{ modelId: "codex-max", displayName: "codex-max" },
			{ modelId: "gpt-5.5(xhigh)", displayName: "gpt-5.5(xhigh)" },
		]);
	});

	it("fetches models without exposing credentials in errors", async () => {
		const fetchImpl = mock(
			async (_input: string | URL | Request, init?: RequestInit) => {
				const headers = init?.headers as Headers;
				expect(headers.get("authorization")).toBe("Bearer fake-token");
				return new Response(
					JSON.stringify({ data: [{ id: "gpt-5.5", object: "model" }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			},
		);

		await expect(
			fetchRemoteModelList({
				protocol: "openai-chat",
				baseUrl: "http://provider.test",
				secret: "fake-token",
				fetchImpl,
			}),
		).resolves.toEqual([{ modelId: "gpt-5.5", displayName: "gpt-5.5" }]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("does not duplicate /v1 when provider base URL already includes it", async () => {
		const fetchImpl = mock(async (input: string | URL | Request) => {
			expect(String(input)).toBe("http://provider.test/v1/models");
			return new Response(JSON.stringify({ data: [{ id: "gpt-5.5" }] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});

		await fetchRemoteModelList({
			protocol: "openai-chat",
			baseUrl: "http://provider.test/v1",
			secret: "fake-token",
			fetchImpl,
		});
	});

	it("returns sanitized upstream failure messages", async () => {
		await expect(
			fetchRemoteModelList({
				protocol: "anthropic",
				baseUrl: "http://provider.test",
				secret: "secret-that-must-not-leak",
				fetchImpl: async () =>
					new Response("secret-that-must-not-leak", { status: 401 }),
			}),
		).rejects.toThrow("Model list request failed with HTTP 401");
	});

	it("returns sanitized network failure messages", async () => {
		const secret = "secret-that-must-not-leak";

		await expect(
			fetchRemoteModelList({
				protocol: "openai-responses",
				baseUrl: "http://provider.test",
				secret,
				fetchImpl: async () => {
					throw new Error(secret);
				},
			}),
		).rejects.toThrow("Model list request failed before receiving a response");
	});
});

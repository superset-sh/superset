import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("auth (provider OAuth/API key) router with stub ChatService", () => {
	let host: TestHost;
	const calls: Array<{ method: string; args: unknown }> = [];

	const stubChatService = {
		getAnthropicAuthStatus: () => {
			calls.push({ method: "getAnthropicAuthStatus", args: undefined });
			return { kind: "none" as const };
		},
		startAnthropicOAuth: () => {
			calls.push({ method: "startAnthropicOAuth", args: undefined });
			return { url: "https://anthropic.example/oauth" };
		},
		completeAnthropicOAuth: (args: unknown) => {
			calls.push({ method: "completeAnthropicOAuth", args });
			return { ok: true };
		},
		cancelAnthropicOAuth: () => {
			calls.push({ method: "cancelAnthropicOAuth", args: undefined });
			return { ok: true };
		},
		disconnectAnthropicOAuth: () => {
			calls.push({ method: "disconnectAnthropicOAuth", args: undefined });
			return { ok: true };
		},
		setAnthropicApiKey: (args: unknown) => {
			calls.push({ method: "setAnthropicApiKey", args });
			return { ok: true };
		},
		clearAnthropicApiKey: () => {
			calls.push({ method: "clearAnthropicApiKey", args: undefined });
			return { ok: true };
		},
		getAnthropicEnvConfig: () => {
			calls.push({ method: "getAnthropicEnvConfig", args: undefined });
			return { envText: "" };
		},
		setAnthropicEnvConfig: (args: unknown) => {
			calls.push({ method: "setAnthropicEnvConfig", args });
			return { ok: true };
		},
		clearAnthropicEnvConfig: () => {
			calls.push({ method: "clearAnthropicEnvConfig", args: undefined });
			return { ok: true };
		},
		getOpenAIAuthStatus: () => {
			calls.push({ method: "getOpenAIAuthStatus", args: undefined });
			return { kind: "none" as const };
		},
		startOpenAIOAuth: () => {
			calls.push({ method: "startOpenAIOAuth", args: undefined });
			return { url: "https://openai.example/oauth" };
		},
		completeOpenAIOAuth: (args: unknown) => {
			calls.push({ method: "completeOpenAIOAuth", args });
			return { ok: true };
		},
		cancelOpenAIOAuth: () => {
			calls.push({ method: "cancelOpenAIOAuth", args: undefined });
			return { ok: true };
		},
		disconnectOpenAIOAuth: () => {
			calls.push({ method: "disconnectOpenAIOAuth", args: undefined });
			return { ok: true };
		},
		setOpenAIApiKey: (args: unknown) => {
			calls.push({ method: "setOpenAIApiKey", args });
			return { ok: true };
		},
		clearOpenAIApiKey: () => {
			calls.push({ method: "clearOpenAIApiKey", args: undefined });
			return { ok: true };
		},
	};

	beforeEach(async () => {
		calls.length = 0;
		host = await createTestHost({ chatService: stubChatService });
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("getAnthropicStatus delegates", async () => {
		const result = await host.trpc.auth.getAnthropicStatus.query();
		expect(result).toEqual({ kind: "none" });
		expect(calls[0].method).toBe("getAnthropicAuthStatus");
	});

	test("startAnthropicOAuth returns the OAuth url", async () => {
		const result = await host.trpc.auth.startAnthropicOAuth.mutate();
		expect(result).toEqual({ url: "https://anthropic.example/oauth" });
	});

	test("completeAnthropicOAuth forwards the code", async () => {
		await host.trpc.auth.completeAnthropicOAuth.mutate({ code: "abc-123" });
		expect(calls[0]).toMatchObject({
			method: "completeAnthropicOAuth",
			args: { code: "abc-123" },
		});
	});

	test("setAnthropicApiKey rejects empty string at the zod boundary", async () => {
		await expect(
			host.trpc.auth.setAnthropicApiKey.mutate({ apiKey: "" }),
		).rejects.toBeInstanceOf(TRPCClientError);
		expect(calls).toHaveLength(0);
	});

	test("setAnthropicApiKey forwards a non-empty key", async () => {
		await host.trpc.auth.setAnthropicApiKey.mutate({ apiKey: "sk-test" });
		expect(calls[0]).toMatchObject({
			method: "setAnthropicApiKey",
			args: { apiKey: "sk-test" },
		});
	});

	test("getOpenAIStatus + setOpenAIApiKey delegate to the OpenAI methods", async () => {
		await host.trpc.auth.getOpenAIStatus.query();
		await host.trpc.auth.setOpenAIApiKey.mutate({ apiKey: "sk-openai" });
		expect(calls.map((c) => c.method)).toEqual([
			"getOpenAIAuthStatus",
			"setOpenAIApiKey",
		]);
	});

	test("disconnect endpoints delegate to the right ChatService method", async () => {
		await host.trpc.auth.disconnectAnthropicOAuth.mutate();
		await host.trpc.auth.disconnectOpenAIOAuth.mutate();
		expect(calls.map((c) => c.method)).toEqual([
			"disconnectAnthropicOAuth",
			"disconnectOpenAIOAuth",
		]);
	});

	test("requires authentication", async () => {
		await expect(
			host.unauthenticatedTrpc.auth.getAnthropicStatus.query(),
		).rejects.toBeInstanceOf(TRPCClientError);
	});
});

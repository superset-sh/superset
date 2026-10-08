import { describe, expect, test } from "bun:test";
import { mintRealtimeClientSecret, RealtimeMintError } from "./realtime";

const input = {
	apiKey: "sk-test",
	model: "gpt-realtime-2.1",
	voice: "marin",
	instructions: "Be brief.",
	tools: [],
	transcriptionModel: "gpt-4o-mini-transcribe",
	ttlSeconds: 120,
	contextTokenLimit: 6000,
	reasoningEffort: "medium",
	speed: 1,
	safetyIdentifier: "user_1",
};

describe("mintRealtimeClientSecret", () => {
	test("posts the session config and returns the secret", async () => {
		let sent: { url: string; init: RequestInit } | null = null;
		const fetchImpl = (async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			sent = { url: String(url), init: init ?? {} };
			return new Response(
				JSON.stringify({ value: "ek_abc", expires_at: 1_700_000_000 }),
				{ status: 200 },
			);
		}) as typeof fetch;

		const secret = await mintRealtimeClientSecret(input, fetchImpl);
		expect(secret).toEqual({ value: "ek_abc", expiresAt: 1_700_000_000 });
		const request = sent as unknown as { url: string; init: RequestInit };
		expect(request.url).toBe(
			"https://api.openai.com/v1/realtime/client_secrets",
		);
		const headers = request.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-test");
		const body = JSON.parse(String(request.init.body));
		expect(body.expires_after.seconds).toBe(120);
		expect(body.session.type).toBe("realtime");
		expect(body.session.model).toBe("gpt-realtime-2.1");
		expect(body.session.audio.input.turn_detection.type).toBe("semantic_vad");
		expect(body.session.audio.output.voice).toBe("marin");
	});

	test("surfaces an upstream failure with its status", async () => {
		const fetchImpl = (async () =>
			new Response("rate limited", { status: 429 })) as typeof fetch;
		await expect(
			mintRealtimeClientSecret(input, fetchImpl),
		).rejects.toBeInstanceOf(RealtimeMintError);
	});

	test("rejects a response without a secret", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
		await expect(mintRealtimeClientSecret(input, fetchImpl)).rejects.toThrow(
			/missing value/,
		);
	});
});

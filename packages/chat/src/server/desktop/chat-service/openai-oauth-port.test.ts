import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import {
	assertOpenAIOAuthCallbackPortAvailable,
	OPENAI_OAUTH_CALLBACK_HOST,
	OPENAI_OAUTH_CALLBACK_PORT,
} from "./openai-oauth-port";

describe("assertOpenAIOAuthCallbackPortAvailable", () => {
	let occupier: Server | null = null;

	afterEach(async () => {
		if (occupier) {
			await new Promise<void>((resolve) => {
				occupier?.close(() => resolve());
			});
			occupier = null;
		}
	});

	it("resolves when the OAuth callback port is free", async () => {
		await expect(
			assertOpenAIOAuthCallbackPortAvailable(),
		).resolves.toBeUndefined();
	});

	it("rejects with a clear error when the OAuth callback port is occupied", async () => {
		occupier = createServer((_, res) => {
			res.statusCode = 200;
			res.end("ok");
		});
		await new Promise<void>((resolve, reject) => {
			occupier?.once("error", reject);
			occupier?.listen(
				OPENAI_OAUTH_CALLBACK_PORT,
				OPENAI_OAUTH_CALLBACK_HOST,
				() => resolve(),
			);
		});

		await expect(assertOpenAIOAuthCallbackPortAvailable()).rejects.toThrow(
			new RegExp(
				`OpenAI OAuth callback port ${OPENAI_OAUTH_CALLBACK_PORT} is already in use`,
			),
		);
	});
});

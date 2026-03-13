import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	decryptOAuthToken,
	encryptOAuthToken,
	isOAuthTokenEncrypted,
} from "./oauth-token-crypto";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const ORIGINAL_KEY = process.env.OAUTH_TOKENS_ENCRYPTION_KEY;

function restoreOriginalKey() {
	if (ORIGINAL_KEY === undefined) {
		delete process.env.OAUTH_TOKENS_ENCRYPTION_KEY;
		return;
	}
	process.env.OAUTH_TOKENS_ENCRYPTION_KEY = ORIGINAL_KEY;
}

describe("oauth-token-crypto", () => {
	beforeEach(() => {
		process.env.OAUTH_TOKENS_ENCRYPTION_KEY = TEST_KEY;
	});

	afterEach(() => {
		restoreOriginalKey();
	});

	it("encrypts and decrypts with roundtrip fidelity", () => {
		const plaintext = "token-value-123";
		const encrypted = encryptOAuthToken(plaintext);

		expect(isOAuthTokenEncrypted(encrypted)).toBe(true);
		expect(encrypted.startsWith("enc:v1:")).toBe(true);
		expect(encrypted).not.toBe(plaintext);
		expect(decryptOAuthToken(encrypted)).toBe(plaintext);
	});

	it("supports plaintext fallback during migration", () => {
		const plaintext = "legacy-plaintext-token";
		expect(isOAuthTokenEncrypted(plaintext)).toBe(false);
		expect(decryptOAuthToken(plaintext)).toBe(plaintext);
	});

	it("throws when encryption key is missing", () => {
		delete process.env.OAUTH_TOKENS_ENCRYPTION_KEY;
		expect(() => encryptOAuthToken("value")).toThrow(
			"OAUTH_TOKENS_ENCRYPTION_KEY not set",
		);
	});

	it("throws when encryption key decodes to invalid length", () => {
		process.env.OAUTH_TOKENS_ENCRYPTION_KEY = Buffer.alloc(8, 1).toString(
			"base64",
		);
		expect(() => encryptOAuthToken("value")).toThrow(
			"OAUTH_TOKENS_ENCRYPTION_KEY must decode to 32 bytes",
		);
	});

	it("rejects tampered ciphertext", () => {
		const encrypted = encryptOAuthToken("sensitive-value");
		const encodedPayload = encrypted.slice("enc:v1:".length);
		const payloadBuffer = Buffer.from(encodedPayload, "base64");
		const lastIndex = payloadBuffer.length - 1;
		const lastByte = payloadBuffer.at(lastIndex);
		if (lastByte === undefined) {
			throw new Error("Encrypted payload unexpectedly empty");
		}
		payloadBuffer[lastIndex] = lastByte ^ 0x01;
		const tampered = `enc:v1:${payloadBuffer.toString("base64")}`;

		expect(() => decryptOAuthToken(tampered)).toThrow();
	});
});

describe("oauth-token-crypto integration flow", () => {
	beforeEach(() => {
		process.env.OAUTH_TOKENS_ENCRYPTION_KEY = TEST_KEY;
	});

	afterEach(() => {
		restoreOriginalKey();
	});

	it("stores callback token payloads as encrypted prefixed values", () => {
		const providerAccessToken = "xoxb-slack-access";
		const providerRefreshToken = "xoxe-slack-refresh";
		const storedAccessToken = encryptOAuthToken(providerAccessToken);
		const storedRefreshToken = encryptOAuthToken(providerRefreshToken);

		expect(storedAccessToken.startsWith("enc:v1:")).toBe(true);
		expect(storedRefreshToken.startsWith("enc:v1:")).toBe(true);
		expect(storedAccessToken).not.toBe(providerAccessToken);
		expect(storedRefreshToken).not.toBe(providerRefreshToken);
	});

	it("restores stored token values for provider SDK consumers", () => {
		const providerAccessToken = "linear-access-token";
		const storedAccessToken = encryptOAuthToken(providerAccessToken);
		const sdkAccessToken = decryptOAuthToken(storedAccessToken);

		expect(sdkAccessToken).toBe(providerAccessToken);
	});
});

import { describe, expect, it, beforeAll } from "bun:test";
import { encryptSecret, decryptSecret } from "./crypto";

describe("crypto utility", () => {
	// Set up a test encryption key in the environment
	beforeAll(() => {
		process.env.SECRETS_ENCRYPTION_KEY = Buffer.from("01234567890123456789012345678901").toString("base64");
	});

	it("should encrypt and decrypt a string correctly", () => {
		const plaintext = "super-secret-token-123";
		const encrypted = encryptSecret(plaintext);
		
		expect(encrypted).not.toBe(plaintext);
		expect(typeof encrypted).toBe("string");
		
		const decrypted = decryptSecret(encrypted);
		expect(decrypted).toBe(plaintext);
	});

	it("should produce different ciphertexts for the same plaintext (IV randomness)", () => {
		const plaintext = "same-text";
		const encrypted1 = encryptSecret(plaintext);
		const encrypted2 = encryptSecret(plaintext);
		
		expect(encrypted1).not.toBe(encrypted2);
	});

	it("should throw an error if the encryption key is missing", () => {
		const originalKey = process.env.SECRETS_ENCRYPTION_KEY;
		delete process.env.SECRETS_ENCRYPTION_KEY;
		
		expect(() => encryptSecret("test")).toThrow("SECRETS_ENCRYPTION_KEY is missing");
		
		process.env.SECRETS_ENCRYPTION_KEY = originalKey;
	});

	it("should fail to decrypt if the ciphertext has been tampered with (GCM integrity)", () => {
		const encrypted = encryptSecret("integrity-test");
		const buf = Buffer.from(encrypted, "base64");
		
		// Tamper with the last byte of the ciphertext
		buf[buf.length - 1] ^= 0xFF;
		const tampered = buf.toString("base64");
		
		expect(() => decryptSecret(tampered)).toThrow();
	});

	it("should handle empty strings", () => {
		const plaintext = "";
		const encrypted = encryptSecret(plaintext);
		const decrypted = decryptSecret(encrypted);
		expect(decrypted).toBe(plaintext);
	});
});

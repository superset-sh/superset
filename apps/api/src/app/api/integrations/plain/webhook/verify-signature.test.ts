import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifyPlainSignature } from "./verify-signature";

const SECRET = "test-signing-secret";

function sign(body: string, secret: string): string {
	return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyPlainSignature", () => {
	test("accepts a valid signature", () => {
		const body = JSON.stringify({ id: "evt_1", type: "thread.thread_created" });
		expect(verifyPlainSignature(body, sign(body, SECRET), SECRET)).toBe(true);
	});

	test("accepts an uppercase hex signature", () => {
		const body = "{}";
		const signature = sign(body, SECRET).toUpperCase();
		expect(verifyPlainSignature(body, signature, SECRET)).toBe(true);
	});

	test("rejects a signature made with a different secret", () => {
		const body = "{}";
		expect(verifyPlainSignature(body, sign(body, "other-secret"), SECRET)).toBe(
			false,
		);
	});

	test("rejects a signature for a different body", () => {
		expect(
			verifyPlainSignature("tampered", sign("original", SECRET), SECRET),
		).toBe(false);
	});

	test("rejects a malformed signature", () => {
		expect(verifyPlainSignature("{}", "not-hex", SECRET)).toBe(false);
	});
});

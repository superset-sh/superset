import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "./verify-svix";

const key = Buffer.from("autumn-test-secret-autumn-test-secret");
const secret = `whsec_${key.toString("base64")}`;
const now = 1_760_000_000_000;
const timestamp = String(now / 1000);
const body = JSON.stringify({
	type: "billing.updated",
	data: { customer_id: "org" },
});

function sign(content: string, signingKey = key) {
	return `v1,${createHmac("sha256", signingKey).update(content).digest("base64")}`;
}

describe("verifySvixSignature", () => {
	const valid = {
		secret,
		id: "msg_1",
		timestamp,
		signature: sign(`msg_1.${timestamp}.${body}`),
		body,
		now,
	};

	test("accepts Autumn's signature, also among rotated ones", () => {
		expect(verifySvixSignature(valid)).toBe(true);
		expect(
			verifySvixSignature({
				...valid,
				signature: `${sign("other", Buffer.from("old"))} ${valid.signature}`,
			}),
		).toBe(true);
	});

	test("rejects another secret, a changed body, a stale timestamp and missing headers", () => {
		expect(
			verifySvixSignature({
				...valid,
				secret: `whsec_${Buffer.from("x").toString("base64")}`,
			}),
		).toBe(false);
		expect(verifySvixSignature({ ...valid, body: `${body} ` })).toBe(false);
		expect(verifySvixSignature({ ...valid, now: now + 10 * 60 * 1000 })).toBe(
			false,
		);
		expect(verifySvixSignature({ ...valid, signature: null })).toBe(false);
	});
});

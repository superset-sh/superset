import { describe, expect, it } from "bun:test";
import { decodeJwtExpiresAtMs } from "./jwt-expiry";

function makeJwt(payload: object): string {
	const encode = (obj: object) =>
		btoa(JSON.stringify(obj))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	return `${encode({ alg: "EdDSA" })}.${encode(payload)}.sig`;
}

describe("decodeJwtExpiresAtMs", () => {
	it("returns exp in epoch milliseconds", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ exp: 1_800_000_000 }))).toBe(
			1_800_000_000_000,
		);
	});

	it("returns null when exp is missing", () => {
		expect(decodeJwtExpiresAtMs(makeJwt({ sub: "u1" }))).toBeNull();
	});

	it("returns null for malformed tokens", () => {
		expect(decodeJwtExpiresAtMs("not-a-jwt")).toBeNull();
		expect(decodeJwtExpiresAtMs("a.%%%.c")).toBeNull();
	});
});

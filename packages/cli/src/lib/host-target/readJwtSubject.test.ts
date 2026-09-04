import { describe, expect, test } from "bun:test";
import { readJwtSubject } from "./readJwtSubject";

function fakeJwt(payload: Record<string, unknown>): string {
	const b64 = (value: string) => Buffer.from(value).toString("base64url");
	return `${b64('{"alg":"none"}')}.${b64(JSON.stringify(payload))}.sig`;
}

describe("readJwtSubject", () => {
	test("returns the sub claim", () => {
		expect(readJwtSubject(fakeJwt({ sub: "user-1", exp: 1 }))).toBe("user-1");
	});

	test("returns null for an API key or a malformed token", () => {
		expect(readJwtSubject("sk_live_abc")).toBeNull();
		expect(readJwtSubject("a.b")).toBeNull();
		expect(
			readJwtSubject(`x.${Buffer.from("nope").toString("base64url")}.y`),
		).toBeNull();
		expect(readJwtSubject(fakeJwt({ sub: "" }))).toBeNull();
	});
});

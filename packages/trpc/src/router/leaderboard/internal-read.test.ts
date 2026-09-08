import { describe, expect, test } from "bun:test";
import { isInternalRead } from "./internal-read";
import { INTERNAL_READ_HEADER } from "./schema";

const TOKEN = "s3cret-token";

describe("isInternalRead", () => {
	test("no token configured never matches, even with no header", () => {
		expect(isInternalRead(new Headers(), undefined)).toBe(false);
		expect(isInternalRead(new Headers(), "")).toBe(false);
	});

	test("no token configured never matches a presented header", () => {
		const headers = new Headers({ [INTERNAL_READ_HEADER]: TOKEN });
		expect(isInternalRead(headers, undefined)).toBe(false);
	});

	test("missing header does not match", () => {
		expect(isInternalRead(new Headers(), TOKEN)).toBe(false);
	});

	test("wrong token does not match", () => {
		expect(
			isInternalRead(new Headers({ [INTERNAL_READ_HEADER]: "other" }), TOKEN),
		).toBe(false);
		expect(
			isInternalRead(
				new Headers({ [INTERNAL_READ_HEADER]: `${TOKEN}x` }),
				TOKEN,
			),
		).toBe(false);
		expect(
			isInternalRead(
				new Headers({ [INTERNAL_READ_HEADER]: TOKEN.slice(0, -1) }),
				TOKEN,
			),
		).toBe(false);
	});

	test("token in another header does not match", () => {
		expect(
			isInternalRead(new Headers({ authorization: `Bearer ${TOKEN}` }), TOKEN),
		).toBe(false);
	});

	test("exact token matches", () => {
		expect(
			isInternalRead(new Headers({ [INTERNAL_READ_HEADER]: TOKEN }), TOKEN),
		).toBe(true);
	});
});

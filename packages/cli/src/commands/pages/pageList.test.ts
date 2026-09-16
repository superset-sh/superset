import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { decodeCursor, encodeCursor } from "./pageList";

const PAGE = "00000000-0000-4000-8000-000000000002";
const UPDATED_AT = "2026-09-14 10:00:00.123456+00";

describe("page list cursor", () => {
	test("survives a round trip through the command line", () => {
		const encoded = encodeCursor({ updatedAt: UPDATED_AT, id: PAGE });
		expect(decodeCursor(encoded)).toEqual({
			updatedAt: UPDATED_AT,
			id: PAGE,
		});
	});

	test("keeps the sub-millisecond digits Postgres reported", () => {
		const decoded = decodeCursor(
			encodeCursor({ updatedAt: UPDATED_AT, id: PAGE }),
		);
		expect(decoded.updatedAt).toContain(".123456");
	});

	test("encodes without characters a shell would mangle", () => {
		const encoded = encodeCursor({ updatedAt: UPDATED_AT, id: PAGE });
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test("reports a typo'd cursor as a CLI error, not a parse crash", () => {
		expect(() => decodeCursor("not-a-cursor")).toThrow(CLIError);
	});

	test("rejects a well-formed token missing the id", () => {
		const encoded = Buffer.from(
			JSON.stringify({ updatedAt: UPDATED_AT }),
		).toString("base64url");
		expect(() => decodeCursor(encoded)).toThrow(CLIError);
	});

	test("rejects a token whose timestamp is not a string", () => {
		const encoded = Buffer.from(
			JSON.stringify({ updatedAt: 12345, id: PAGE }),
		).toString("base64url");
		expect(() => decodeCursor(encoded)).toThrow(CLIError);
	});
});

import { describe, expect, test } from "bun:test";
import { decodePageCursor, encodePageCursor } from "./cursor";

const PAGE = "00000000-0000-4000-8000-000000000002";
const CREATED_AT = "2026-09-14 10:00:00.123456+00";

describe("page list cursor", () => {
	test("survives a round trip", () => {
		const encoded = encodePageCursor({ createdAt: CREATED_AT, id: PAGE });
		expect(decodePageCursor(encoded)).toEqual({
			createdAt: CREATED_AT,
			id: PAGE,
		});
	});

	test("keeps the sub-millisecond digits Postgres reported", () => {
		const decoded = decodePageCursor(
			encodePageCursor({ createdAt: CREATED_AT, id: PAGE }),
		);
		expect(decoded?.createdAt).toContain(".123456");
	});

	test("encodes without characters a shell or URL would mangle", () => {
		const encoded = encodePageCursor({ createdAt: CREATED_AT, id: PAGE });
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	test("rejects a typo'd cursor rather than crashing on the parse", () => {
		expect(decodePageCursor("not-a-cursor")).toBeNull();
	});

	test("rejects a well-formed token missing the id", () => {
		const encoded = Buffer.from(
			JSON.stringify({ createdAt: CREATED_AT }),
		).toString("base64url");
		expect(decodePageCursor(encoded)).toBeNull();
	});

	test("rejects a token whose timestamp is not a string", () => {
		const encoded = Buffer.from(
			JSON.stringify({ createdAt: 12345, id: PAGE }),
		).toString("base64url");
		expect(decodePageCursor(encoded)).toBeNull();
	});

	test("rejects a timestamp that is not a Postgres timestamptz", () => {
		// This value reaches the query as `::timestamptz`, so the shape is
		// checked rather than trusted from whatever the caller echoed back.
		const encoded = Buffer.from(
			JSON.stringify({
				createdAt: "2026-09-14T10:00:00Z'; drop table",
				id: PAGE,
			}),
		).toString("base64url");
		expect(decodePageCursor(encoded)).toBeNull();
	});

	test("accepts the offsets Postgres emits, whole-hour and half-hour alike", () => {
		for (const createdAt of [
			"2026-09-14 10:00:00+00",
			"2026-09-14 10:00:00.123456+05:30",
			"2026-09-14 10:00:00.1-08",
		]) {
			const encoded = Buffer.from(
				JSON.stringify({ createdAt, id: PAGE }),
			).toString("base64url");
			expect(decodePageCursor(encoded)).toEqual({ createdAt, id: PAGE });
		}
	});

	test("rejects an id that is not a uuid", () => {
		const encoded = Buffer.from(
			JSON.stringify({ createdAt: CREATED_AT, id: "not-a-uuid" }),
		).toString("base64url");
		expect(decodePageCursor(encoded)).toBeNull();
	});
});

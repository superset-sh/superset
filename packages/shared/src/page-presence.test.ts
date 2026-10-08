import { describe, expect, test } from "bun:test";
import {
	cursorPointsFrom,
	MAX_PAGE_CURSOR_PATH_LENGTH,
	pagePresenceUrl,
	parsePageCursor,
	presenceColor,
	presenceViewersFrom,
} from "./page-presence";

describe("parsePageCursor", () => {
	test("keeps a cursor and clamps it to the element's box", () => {
		expect(
			parsePageCursor({ path: "div:nth-of-type(1)", x: 1.4, y: -2 }),
		).toEqual({ path: "div:nth-of-type(1)", x: 1, y: 0 });
	});

	test("passes null through as a hidden cursor", () => {
		expect(parsePageCursor(null)).toBeNull();
	});

	test("refuses anything else rather than relaying it", () => {
		expect(parsePageCursor({ path: "", x: Number.NaN, y: 0 })).toBeUndefined();
		expect(parsePageCursor({ path: 1, x: 0, y: 0 })).toBeUndefined();
		expect(
			parsePageCursor({
				path: "a".repeat(MAX_PAGE_CURSOR_PATH_LENGTH + 1),
				x: 0,
				y: 0,
			}),
		).toBeUndefined();
		expect(parsePageCursor("cursor")).toBeUndefined();
		expect(
			parsePageCursor({ path: "div, body *:has(img)", x: 0, y: 0 }),
		).toBeUndefined();
	});

	test("accepts only the element paths the runtime itself builds", () => {
		expect(
			parsePageCursor({
				path: "main:nth-of-type(1) > my-card:nth-of-type(12) > h2:nth-of-type(1)",
				x: 0.5,
				y: 0.5,
			}),
		).toEqual({
			path: "main:nth-of-type(1) > my-card:nth-of-type(12) > h2:nth-of-type(1)",
			x: 0.5,
			y: 0.5,
		});
		expect(parsePageCursor({ path: "", x: 0, y: 0 })).toEqual({
			path: "",
			x: 0,
			y: 0,
		});
	});
});

describe("presenceColor", () => {
	test("gives one person the same colour in every viewer's frame", () => {
		expect(presenceColor("guest:1")).toBe(presenceColor("guest:1"));
	});

	test("spreads people across the palette", () => {
		const colors = new Set(
			Array.from({ length: 40 }, (_, index) => presenceColor(`user-${index}`)),
		);
		expect(colors.size).toBeGreaterThan(4);
	});
});

describe("what a host accepts from the frame", () => {
	test("keeps well-formed viewers and drops a non-https avatar", () => {
		expect(
			presenceViewersFrom([
				{ id: "c1", userId: "u1", name: "Ada", image: "http://x/a.png" },
				{ id: "c2", userId: "u2", name: 7 },
				null,
			]),
		).toEqual([
			{
				id: "c1",
				userId: "u1",
				name: "Ada",
				image: null,
				guest: false,
				guestNumber: null,
				cursor: null,
			},
		]);
		expect(presenceViewersFrom("viewers")).toEqual([]);
	});

	test("keeps only cursors with a finite position", () => {
		expect(
			cursorPointsFrom([
				{ id: "c1", x: 1, y: 2 },
				{ id: "c2", x: Number.NaN, y: 0 },
				{ x: 1, y: 1 },
			]),
		).toEqual([{ id: "c1", x: 1, y: 2 }]);
	});
});

describe("pagePresenceUrl", () => {
	test("dials the page's presence socket with a token or a guest id", () => {
		expect(
			pagePresenceUrl({
				realtimeUrl: "https://realtime.superset.sh",
				pageId: "p1",
				token: "jwt",
			}),
		).toBe("wss://realtime.superset.sh/v2/page/p1/presence?token=jwt");
		expect(
			pagePresenceUrl({
				realtimeUrl: "http://localhost:4698",
				pageId: "p1",
				guestId: "g1",
			}),
		).toBe("ws://localhost:4698/v2/page/p1/presence?guest=g1");
	});
});

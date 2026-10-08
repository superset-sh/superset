import { describe, expect, test } from "bun:test";
import {
	pagePresenceUrl,
	presenceColor,
	presenceViewersFrom,
} from "./page-presence";

describe("presenceColor", () => {
	test("gives one person the same colour everywhere", () => {
		expect(presenceColor("guest:1")).toBe(presenceColor("guest:1"));
	});

	test("spreads people across the palette", () => {
		const colors = new Set(
			Array.from({ length: 40 }, (_, index) => presenceColor(`user-${index}`)),
		);
		expect(colors.size).toBeGreaterThan(4);
	});
});

describe("presenceViewersFrom", () => {
	test("keeps well-formed viewers and drops a non-https avatar", () => {
		expect(
			presenceViewersFrom([
				{
					id: "c1",
					userId: "u1",
					name: "Ada",
					image: "http://x/a.png",
					guestNumber: 2,
				},
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
				guestNumber: 2,
			},
		]);
		expect(presenceViewersFrom("viewers")).toEqual([]);
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

import { describe, expect, test } from "bun:test";
import {
	pagePresenceUrl,
	presenceColor,
	presenceViewersFrom,
} from "./page-presence";

describe("presenceColor", () => {
	test("maps each colour slot the hub hands out to a distinct colour", () => {
		const colors = Array.from({ length: 8 }, (_, slot) => presenceColor(slot));
		expect(new Set(colors).size).toBe(8);
		expect(presenceColor(8)).toBe(presenceColor(0));
	});
});

describe("presenceViewersFrom", () => {
	test("keeps well-formed viewers and drops a non-https avatar", () => {
		expect(
			presenceViewersFrom([
				{
					id: "c1",
					key: "k1",
					name: "Ada",
					image: "http://x/a.png",
					guestNumber: 2,
					color: 3,
				},
				{ id: "c2", key: "k2", name: 7 },
				null,
			]),
		).toEqual([
			{
				id: "c1",
				key: "k1",
				name: "Ada",
				image: null,
				guest: false,
				guestNumber: 2,
				color: 3,
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

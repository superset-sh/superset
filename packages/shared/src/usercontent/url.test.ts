import { describe, expect, test } from "bun:test";
import { pageIdFromHost, pageThumbnailUrl, pageViewUrl } from "./url";

const BASE = "https://frame.supersetusercontent.com";
const ID = "d28d7b35-813f-43a0-b3f9-9d8988dd1d58";
const TICKET = "eyJraW5kIjoicGFnZSJ9.c2ln";

describe("pageViewUrl", () => {
	test("served version, public", () => {
		expect(pageViewUrl({ baseUrl: BASE, pageId: ID })).toBe(
			`https://${ID}.frame.supersetusercontent.com/`,
		);
	});

	test("served version, ticketed: ticket is a path segment", () => {
		expect(pageViewUrl({ baseUrl: BASE, pageId: ID, ticket: TICKET })).toBe(
			`https://${ID}.frame.supersetusercontent.com/~${TICKET}/`,
		);
	});

	test("pinned version, public", () => {
		expect(pageViewUrl({ baseUrl: BASE, pageId: ID, version: 3 })).toBe(
			`https://${ID}.frame.supersetusercontent.com/versions/3/`,
		);
	});

	test("pinned version, ticketed: relative references inherit the prefix", () => {
		const url = pageViewUrl({
			baseUrl: BASE,
			pageId: ID,
			version: 3,
			ticket: TICKET,
		});
		expect(url).toBe(
			`https://${ID}.frame.supersetusercontent.com/versions/3/~${TICKET}/`,
		);
		expect(new URL("demo.mp4", url).pathname).toBe(
			`/versions/3/~${TICKET}/demo.mp4`,
		);
	});
});

describe("pageThumbnailUrl", () => {
	test("ticket stays in the query", () => {
		expect(
			pageThumbnailUrl({
				baseUrl: BASE,
				pageId: ID,
				version: 2,
				ticket: TICKET,
			}),
		).toBe(
			`https://${ID}.frame.supersetusercontent.com/versions/2/thumbnail.jpg?ticket=${encodeURIComponent(TICKET)}`,
		);
	});

	test("public thumbnail is bare", () => {
		expect(pageThumbnailUrl({ baseUrl: BASE, pageId: ID, version: 2 })).toBe(
			`https://${ID}.frame.supersetusercontent.com/versions/2/thumbnail.jpg`,
		);
	});
});

describe("pageIdFromHost", () => {
	const baseHost = "frame.supersetusercontent.com";

	test("accepts a uuid label", () => {
		expect(pageIdFromHost(`${ID}.${baseHost}`, baseHost)).toBe(ID);
	});

	test("rejects the apex, slugs, and foreign hosts", () => {
		expect(pageIdFromHost(baseHost, baseHost)).toBeNull();
		expect(pageIdFromHost(`my-page.${baseHost}`, baseHost)).toBeNull();
		expect(pageIdFromHost(`${ID}.evil.example`, baseHost)).toBeNull();
	});
});

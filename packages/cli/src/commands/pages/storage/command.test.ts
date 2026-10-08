import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { displayStorage, readStorage, userJwt } from "./command";

const UPDATED = "2026-10-01T12:00:00.000Z";

describe("displayStorage", () => {
	test("lists each key with its record count", () => {
		const output = displayStorage({
			pageId: "page-1",
			keys: [{ key: "votes", records: 3, updatedAt: UPDATED }],
		});
		expect(output).toContain("KEY");
		expect(output).toMatch(/votes\s+3/);
	});

	test("prints a long key whole so it can be passed to --key", () => {
		const key = "k".repeat(128);
		const output = displayStorage({
			pageId: "page-1",
			keys: [{ key, records: 1, updatedAt: UPDATED }],
		});
		expect(output).toContain(key);
	});

	test("escapes control characters a viewer stored", () => {
		const keys = displayStorage({
			pageId: "page-1",
			keys: [{ key: "\u001b[2Jvotes", records: 1, updatedAt: UPDATED }],
		});
		const slots = displayStorage({
			pageId: "page-1",
			key: "votes",
			records: [
				{
					userId: "u1",
					name: "Ada",
					image: null,
					value: "\u009b2J",
					updatedAt: UPDATED,
				},
			],
		});
		expect(keys).toContain("\\u001b[2Jvotes");
		expect(slots).toContain("\\u009b2J");
		expect(`${keys}${slots}`).not.toContain("\u001b");
		expect(`${keys}${slots}`).not.toContain("\u009b");
	});

	test("shows every person's slot for one key", () => {
		const output = displayStorage({
			pageId: "page-1",
			key: "votes",
			records: [
				{
					userId: "u1",
					name: "Ada",
					image: null,
					value: { pick: "b" },
					updatedAt: UPDATED,
				},
			],
		});
		expect(output).toMatch(/Ada\s+\{"pick":"b"\}/);
	});

	test("says so when a key has no records", () => {
		expect(
			displayStorage({ pageId: "page-1", key: "votes", records: [] }),
		).toBe('No records for key "votes".');
	});
});

function recordingFetch(status: number, body: unknown) {
	const requests: { url: string; headers: Headers }[] = [];
	const fetchImpl = (async (url: string, init?: RequestInit) => {
		requests.push({ url, headers: new Headers(init?.headers) });
		return Response.json(body, { status });
	}) as unknown as typeof fetch;
	return { fetchImpl, requests };
}

describe("readStorage", () => {
	test("asks realtime for one key with the user's token", async () => {
		const { fetchImpl, requests } = recordingFetch(200, {
			pageId: "page-1",
			key: "a b",
			records: [],
		});
		await readStorage({
			realtimeUrl: "https://realtime.test",
			jwt: "jwt",
			pageId: "page-1",
			key: "a b",
			fetchImpl,
		});
		expect(requests[0]?.url).toBe(
			"https://realtime.test/v2/page/page-1/storage/records?key=a%20b",
		);
		expect(requests[0]?.headers.get("authorization")).toBe("Bearer jwt");
	});

	test("tells someone who cannot open the page that they cannot read its storage", async () => {
		const { fetchImpl } = recordingFetch(403, {
			error: "You cannot read this page's storage",
		});
		const read = readStorage({
			realtimeUrl: "https://realtime.test",
			jwt: "jwt",
			pageId: "page-1",
			fetchImpl,
		});
		await expect(read).rejects.toBeInstanceOf(CLIError);
		await expect(read).rejects.toThrow("You cannot read this page's storage");
	});
});

describe("userJwt", () => {
	test("passes an OAuth access token through", async () => {
		const { fetchImpl, requests } = recordingFetch(200, {});
		expect(await userJwt("a.b.c", fetchImpl)).toBe("a.b.c");
		expect(requests).toHaveLength(0);
	});

	test("exchanges an API key for a token", async () => {
		const { fetchImpl, requests } = recordingFetch(200, { token: "minted" });
		expect(await userJwt("sk_live_abc", fetchImpl)).toBe("minted");
		expect(requests[0]?.url).toEndWith("/api/auth/token");
		expect(requests[0]?.headers.get("x-api-key")).toBe("sk_live_abc");
	});
});

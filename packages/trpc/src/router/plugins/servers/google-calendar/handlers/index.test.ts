import { afterEach, describe, expect, test } from "bun:test";
import { callTool } from ".";

interface Call {
	method: string;
	url: URL;
	body: Record<string, unknown> | undefined;
}

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function google(
	route: (call: Call) => { status?: number; body?: unknown },
): Call[] {
	const calls: Call[] = [];
	globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
		const call: Call = {
			method: init.method ?? "GET",
			url: new URL(String(input)),
			body: init.body ? JSON.parse(String(init.body)) : undefined,
		};
		calls.push(call);
		const { status = 200, body = {} } = route(call);
		return new Response(JSON.stringify(body), {
			status,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return calls;
}

function output(result: Awaited<ReturnType<typeof callTool>>): string {
	const [first] = result.content;
	return first?.type === "text" ? first.text : "";
}

describe("create_event", () => {
	test("a local time takes the calendar's zone and invites everyone by default", async () => {
		const calls = google((call) =>
			call.method === "GET"
				? { body: { timeZone: "Asia/Kolkata" } }
				: { body: { id: "evt1", summary: "Sync" } },
		);

		await callTool(
			"create_event",
			{
				summary: "Sync",
				start: "2026-10-07T15:00:00",
				end: "2026-10-07T15:30:00",
				attendees: ["a@example.com"],
			},
			"token",
		);

		expect(calls[0]?.url.pathname).toBe("/calendar/v3/calendars/primary");
		const create = calls[1];
		expect(create?.method).toBe("POST");
		expect(create?.url.pathname).toBe("/calendar/v3/calendars/primary/events");
		expect(create?.url.searchParams.get("sendUpdates")).toBe("all");
		expect(create?.body?.start).toEqual({
			dateTime: "2026-10-07T15:00:00",
			timeZone: "Asia/Kolkata",
		});
	});

	test("a missing write scope says to reconnect Google", async () => {
		google(() => ({
			status: 403,
			body: {
				error: { message: "Request had insufficient authentication scopes." },
			},
		}));

		const result = await callTool(
			"create_event",
			{
				summary: "Sync",
				start: "2026-10-07T15:00:00Z",
				end: "2026-10-07T15:30:00Z",
			},
			"token",
		);

		expect(result.isError).toBe(true);
		expect(output(result)).toContain("reconnect Google");
	});

	test("an event id cannot climb out of the events path", async () => {
		const calls = google(() => ({}));
		const result = await callTool("delete_event", { eventId: ".." }, "token");
		expect(result.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});
});

describe("update_event", () => {
	test("keeps the replies of guests who stay on the list", async () => {
		const calls = google((call) =>
			call.method === "GET"
				? {
						body: {
							id: "evt1",
							attendees: [
								{ email: "a@example.com", responseStatus: "accepted" },
								{ email: "b@example.com", responseStatus: "declined" },
							],
						},
					}
				: { body: { id: "evt1" } },
		);

		await callTool(
			"update_event",
			{ eventId: "evt1", attendees: ["a@example.com", "c@example.com"] },
			"token",
		);

		expect(calls[1]?.body?.attendees).toEqual([
			{ email: "a@example.com", responseStatus: "accepted", optional: false },
			{ email: "c@example.com", optional: false },
		]);
	});

	test("null attendees fail instead of removing every guest", async () => {
		const calls = google(() => ({ body: { id: "evt1" } }));

		const result = await callTool(
			"update_event",
			{ eventId: "evt1", attendees: null },
			"token",
		);

		expect(result.isError).toBe(true);
		expect(calls.some((call) => call.method === "PATCH")).toBe(false);
	});
});

describe("respond_to_event", () => {
	test("sends only the user's own reply", async () => {
		const calls = google((call) =>
			call.method === "GET"
				? {
						body: {
							id: "evt1",
							attendees: [
								{ email: "boss@example.com", responseStatus: "accepted" },
								{ email: "me@example.com", self: true },
							],
						},
					}
				: { body: { id: "evt1" } },
		);

		await callTool(
			"respond_to_event",
			{ eventId: "evt1", response: "declined" },
			"token",
		);

		expect(calls[1]?.body).toEqual({
			attendeesOmitted: true,
			attendees: [{ email: "me@example.com", responseStatus: "declined" }],
		});
	});
});

describe("find_free_time", () => {
	test("reports the gaps everyone shares that are long enough", async () => {
		google(() => ({
			body: {
				calendars: {
					primary: {
						busy: [
							{ start: "2026-10-07T10:00:00Z", end: "2026-10-07T11:00:00Z" },
						],
					},
					"b@example.com": {
						busy: [
							{ start: "2026-10-07T10:30:00Z", end: "2026-10-07T12:00:00Z" },
							{ start: "2026-10-07T12:15:00Z", end: "2026-10-07T13:00:00Z" },
						],
					},
				},
			},
		}));

		const result = await callTool(
			"find_free_time",
			{
				calendarIds: ["primary", "b@example.com"],
				timeMin: "2026-10-07T09:00:00Z",
				timeMax: "2026-10-07T14:00:00Z",
				durationMinutes: 30,
			},
			"token",
		);

		const text = output(result);
		expect(text).toContain(
			"2026-10-07T09:00:00.000Z → 2026-10-07T10:00:00.000Z",
		);
		expect(text).toContain(
			"2026-10-07T13:00:00.000Z → 2026-10-07T14:00:00.000Z",
		);
		expect(text).not.toContain("12:00:00.000Z → 2026-10-07T12:15");
	});

	test("a calendar Google cannot read is unknown, not free", async () => {
		google(() => ({
			body: {
				calendars: {
					primary: { busy: [] },
					"b@example.com": { errors: [{ reason: "notFound" }] },
				},
			},
		}));

		const result = await callTool(
			"find_free_time",
			{
				calendarIds: ["primary", "b@example.com", "c@example.com"],
				timeMin: "2026-10-07T09:00:00Z",
				timeMax: "2026-10-07T17:00:00Z",
			},
			"token",
		);

		const text = output(result);
		expect(text).toContain("b@example.com: not readable (notFound)");
		expect(text).toContain(
			"c@example.com: not readable (missing from Google's reply)",
		);
	});
});

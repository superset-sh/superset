import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-token",
		NEXT_PUBLIC_API_URL: "http://localhost",
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

const publishJSON = mock(async (_options: unknown) => ({}));
beforeEach(() => publishJSON.mockClear());

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSON;
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: () => true,
}));

mock.module("./process-app-home-opened", () => ({
	processAppHomeOpened: mock(async () => ({})),
}));

mock.module("./process-automation-event", () => ({
	isAutomationEvent: () => false,
	processAutomationEvent: mock(async () => ({
		status: "skipped",
		reason: "unknown workspace",
	})),
}));

mock.module("./process-entity-details", () => ({
	processEntityDetails: mock(async () => ({})),
}));

mock.module("./process-link-shared", () => ({
	processLinkShared: mock(async () => ({})),
}));

const followUpTarget = mock(
	async (_key: unknown): Promise<{ id: string } | null> => null,
);
// Complete on purpose: bun keeps the first registration of a module across
// test files, so a partial mock here would break the handler test's imports.
mock.module("./utils/thread-sessions", () => ({
	threadFollowUpTarget: followUpTarget,
	beginThreadRun: async () => ({ id: "session", entityLog: [], quiet: false }),
	finishThreadRun: async () => {},
	setThreadQuiet: async () => {},
	threadFollowUpsEnabled: async () => true,
	parseThreadCommand: () => null,
	takeQueuedEvents: async () => [],
	renderThreadMemory: () => "",
}));
mock.module("./process-automation-event/normalizeSlackDelivery", () => ({
	ownBotUserIds: (envelope: { authorizations?: { user_id?: string }[] }) =>
		(envelope.authorizations ?? []).map((a) => a.user_id),
}));

const { POST } = await import("./route");

const VALID_HEADERS = {
	"x-slack-signature": "v0=fake",
	"x-slack-request-timestamp": "1700000000",
};

describe("slack events route", () => {
	test("returns 400 (not 500) when body is malformed JSON", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: "{not valid json",
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("returns 400 when body is empty", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: "",
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
	});

	test("returns 400 when body is JSON null", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: "null",
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("returns 400 when event_callback envelope is malformed", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: JSON.stringify({
					type: "event_callback",
					team_id: "T123",
					event_id: "E123",
					event: null,
				}),
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid payload shape");
	});

	test("returns 200 when app_home_opened payload is missing optional fields", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: JSON.stringify({
					type: "event_callback",
					team_id: "T123",
					event_id: "E123",
					event: { type: "app_home_opened", user: "U123" },
				}),
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("processes well-formed url_verification payload", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/events",
			{
				method: "POST",
				headers: VALID_HEADERS,
				body: JSON.stringify({ type: "url_verification", challenge: "abc" }),
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
		const json = (await response.json()) as { challenge: string };
		expect(json.challenge).toBe("abc");
	});
});

function eventRequest(event: Record<string, unknown>, retry = false) {
	return new Request("http://localhost/api/integrations/slack/events", {
		method: "POST",
		headers: {
			...VALID_HEADERS,
			...(retry ? { "x-slack-retry-num": "1" } : {}),
		},
		body: JSON.stringify({
			type: "event_callback",
			team_id: "T1",
			event_id: "Ev1",
			event,
		}),
	});
}

describe("Slack agent delivery", () => {
	test("uses the same deduplication key for Slack retries", async () => {
		const event = { type: "app_mention", user: "U1", channel: "C1", ts: "1.0" };
		expect((await POST(eventRequest(event))).status).toBe(200);
		expect((await POST(eventRequest(event, true))).status).toBe(200);
		for (const [options] of publishJSON.mock.calls) {
			expect(options).toMatchObject({ deduplicationId: "Ev1", retries: 3 });
		}
		expect(publishJSON).toHaveBeenCalledTimes(2);
	});
	test("does not acknowledge a mention that could not be queued", async () => {
		publishJSON.mockImplementationOnce(async () => {
			throw new Error("offline");
		});
		expect((await POST(eventRequest({ type: "app_mention" }))).status).toBe(
			503,
		);
	});
	test("does not acknowledge a DM that could not be queued", async () => {
		publishJSON.mockImplementationOnce(async () => {
			throw new Error("offline");
		});
		expect(
			(
				await POST(
					eventRequest({ type: "message", channel_type: "im", user: "U1" }),
				)
			).status,
		).toBe(503);
	});
	test("ignores bot, edited, and deleted messages", async () => {
		for (const extra of [
			{ bot_id: "B1" },
			{ subtype: "bot_message" },
			{ subtype: "message_changed" },
			{ subtype: "message_deleted" },
		]) {
			expect(
				(
					await POST(
						eventRequest({
							type: "message",
							channel_type: "im",
							user: "U1",
							...extra,
						}),
					)
				).status,
			).toBe(200);
		}
		expect(publishJSON).not.toHaveBeenCalled();
	});
	test("accepts human file shares in DMs", async () => {
		expect(
			(
				await POST(
					eventRequest({
						type: "message",
						channel_type: "im",
						user: "U1",
						subtype: "file_share",
					}),
				)
			).status,
		).toBe(200);
		expect(publishJSON).toHaveBeenCalledTimes(1);
	});

	function channelReply(text: string, extra: Record<string, unknown> = {}) {
		return new Request("http://localhost/api/integrations/slack/events", {
			method: "POST",
			headers: VALID_HEADERS,
			body: JSON.stringify({
				type: "event_callback",
				team_id: "T1",
				event_id: "Ev-thread",
				authorizations: [{ user_id: "UBOT", is_bot: true }],
				event: {
					type: "message",
					channel_type: "channel",
					channel: "C1",
					user: "U1",
					text,
					ts: "20.0",
					thread_ts: "1.0",
					...extra,
				},
			}),
		});
	}

	test("a reply in a thread the agent has joined is queued as a mention job", async () => {
		followUpTarget.mockImplementationOnce(async () => ({ id: "session" }));
		const response = await POST(channelReply("also add a test"));
		expect(response.status).toBe(200);
		expect(followUpTarget).toHaveBeenCalledWith({
			teamId: "T1",
			channelId: "C1",
			threadTs: "1.0",
		});
		expect(publishJSON).toHaveBeenCalledTimes(1);
		expect(publishJSON.mock.calls[0]?.[0]).toMatchObject({
			url: expect.stringContaining("/jobs/process-mention"),
			deduplicationId: "Ev-thread",
		});
	});

	test("a reply in a thread without a session, or a top-level channel post, is ignored", async () => {
		followUpTarget.mockClear();
		await POST(channelReply("random chatter"));
		await POST(channelReply("top level", { thread_ts: undefined }));
		expect(publishJSON).not.toHaveBeenCalled();
		expect(followUpTarget).toHaveBeenCalledTimes(1);
	});

	test("a reply also sent to the channel still counts as a thread reply", async () => {
		followUpTarget.mockClear();
		followUpTarget.mockImplementationOnce(async () => ({ id: "session" }));
		await POST(
			channelReply("broadcast reply", { subtype: "thread_broadcast" }),
		);
		expect(publishJSON).toHaveBeenCalledTimes(1);
	});

	test("a thread reply that mentions the bot is left to the app_mention path", async () => {
		followUpTarget.mockClear();
		followUpTarget.mockImplementationOnce(async () => ({ id: "session" }));
		await POST(channelReply("<@UBOT> and this"));
		expect(followUpTarget).not.toHaveBeenCalled();
		expect(publishJSON).not.toHaveBeenCalled();
	});
});

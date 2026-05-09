import { describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-token",
		NEXT_PUBLIC_API_URL: "http://localhost",
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = mock(async () => ({}));
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: () => true,
}));

mock.module("./process-app-home-opened", () => ({
	processAppHomeOpened: mock(async () => ({})),
}));

mock.module("./process-entity-details", () => ({
	processEntityDetails: mock(async () => ({})),
}));

mock.module("./process-link-shared", () => ({
	processLinkShared: mock(async () => ({})),
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

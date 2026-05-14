import { describe, expect, mock, test } from "bun:test";

const findSlackUser = mock(async () => undefined);

mock.module("@/env", () => ({
	env: {
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

mock.module("@/lib/analytics", () => ({
	posthog: { capture: () => undefined },
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: { usersSlackUsers: { findFirst: findSlackUser } },
		update: () => ({ set: () => ({ where: async () => undefined }) }),
		delete: () => ({ where: async () => undefined }),
	},
}));

mock.module("@superset/db/schema", () => ({
	usersSlackUsers: {
		slackUserId: "slackUserId",
		teamId: "teamId",
		id: "id",
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: () => true,
}));

mock.module("../events/process-app-home-opened", () => ({
	processAppHomeOpened: mock(async () => ({})),
}));

const { POST } = await import("./route");

const VALID_HEADERS = {
	"x-slack-signature": "v0=fake",
	"x-slack-request-timestamp": "1700000000",
};

describe("slack interactions route", () => {
	test("returns 400 (not 500) when payload is malformed JSON", async () => {
		const body = `payload=${encodeURIComponent("{not valid json")}`;
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("returns 400 when payload is JSON null", async () => {
		const body = `payload=${encodeURIComponent("null")}`;
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Invalid JSON payload");
	});

	test("returns 200 (no-op) when payload field is missing", async () => {
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: "",
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
	});

	test("returns 200 for well-formed payload with no actionable type", async () => {
		const body = `payload=${encodeURIComponent(JSON.stringify({ type: "view_submission" }))}`;
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
	});

	test("returns 200 when block actions payload has non-array actions", async () => {
		const body = `payload=${encodeURIComponent(
			JSON.stringify({
				type: "block_actions",
				team: { id: "T123" },
				user: { id: "U123" },
				actions: "not-an-array",
			}),
		)}`;
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
	});

	test("ignores model select actions with malformed selected option values", async () => {
		const callsBefore = findSlackUser.mock.calls.length;
		const body = `payload=${encodeURIComponent(
			JSON.stringify({
				type: "block_actions",
				team: { id: "T123" },
				user: { id: "U123" },
				actions: [
					{
						action_id: "model_select",
						selected_option: { value: 123 },
					},
				],
			}),
		)}`;
		const request = new Request(
			"http://localhost/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					...VALID_HEADERS,
					"content-type": "application/x-www-form-urlencoded",
				},
				body,
			},
		);

		const response = await POST(request);

		expect(response.status).toBe(200);
		expect(findSlackUser.mock.calls).toHaveLength(callsBefore);
	});
});

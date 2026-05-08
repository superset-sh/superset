import { describe, expect, mock, test } from "bun:test";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NODE_ENV = "test";

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			usersSlackUsers: { findFirst: mock(() => Promise.resolve(null)) },
		},
		update: mock(() => ({
			set: mock(() => ({ where: mock(() => Promise.resolve()) })),
		})),
		delete: mock(() => ({ where: mock(() => Promise.resolve()) })),
	},
}));

mock.module("@superset/db/schema", () => ({
	usersSlackUsers: {
		slackUserId: "slackUserId",
		teamId: "teamId",
		id: "id",
	},
}));

mock.module("@/lib/analytics", () => ({
	posthog: { capture: mock(() => {}) },
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: mock(() => true),
}));

mock.module("../events/process-app-home-opened", () => ({
	processAppHomeOpened: mock(() => Promise.resolve()),
}));

const { POST } = await import("./route");

describe("POST /api/integrations/slack/interactions", () => {
	test("returns 400 when payload param is not valid JSON", async () => {
		const params = new URLSearchParams();
		params.set("payload", "{not valid json");

		const request = new Request(
			"https://example.com/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					"x-slack-signature": "v0=test",
					"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
				},
				body: params.toString(),
			},
		);

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	test("returns 200 when payload param is missing", async () => {
		const request = new Request(
			"https://example.com/api/integrations/slack/interactions",
			{
				method: "POST",
				headers: {
					"x-slack-signature": "v0=test",
					"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
				},
				body: "",
			},
		);

		const response = await POST(request);
		expect(response.status).toBe(200);
	});
});

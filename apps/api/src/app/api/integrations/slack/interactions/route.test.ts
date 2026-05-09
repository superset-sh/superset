import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		SLACK_SIGNING_SECRET: "test-secret",
		NEXT_PUBLIC_POSTHOG_KEY: "test",
		NEXT_PUBLIC_POSTHOG_HOST: "http://localhost",
	},
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: {
			usersSlackUsers: { findFirst: mock(() => Promise.resolve(null)) },
		},
		update: mock(() => ({ set: () => ({ where: () => Promise.resolve() }) })),
		delete: mock(() => ({ where: () => Promise.resolve() })),
	},
}));

mock.module("@superset/db/schema", () => ({
	usersSlackUsers: {
		slackUserId: "slack_user_id",
		teamId: "team_id",
		id: "id",
	},
}));

mock.module("@/lib/analytics", () => ({
	posthog: { capture: mock(() => undefined) },
}));

const verifySlackSignature = mock(() => true);

mock.module("../verify-signature", () => ({
	verifySlackSignature,
}));

mock.module("../events/process-app-home-opened", () => ({
	processAppHomeOpened: mock(() => Promise.resolve()),
}));

const { POST } = await import("./route");

function buildRequest(body: string): Request {
	return new Request("http://localhost/api/integrations/slack/interactions", {
		method: "POST",
		headers: {
			"x-slack-signature": "v0=test",
			"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
		},
		body,
	});
}

describe("POST /api/integrations/slack/interactions", () => {
	beforeEach(() => {
		verifySlackSignature.mockClear();
	});

	test("returns 400 instead of crashing when payload is malformed JSON", async () => {
		const body = `payload=${encodeURIComponent("{not valid json")}`;
		const response = await POST(buildRequest(body));
		expect(response.status).toBe(400);
	});

	test("returns 200 when payload param is missing", async () => {
		const response = await POST(buildRequest("other=foo"));
		expect(response.status).toBe(200);
	});
});

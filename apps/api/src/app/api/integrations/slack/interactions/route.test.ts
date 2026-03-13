import { describe, expect, mock, test } from "bun:test";

// Mock heavy dependencies before importing the route handler
mock.module("@/env", () => ({
	env: {
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: () => true,
}));

mock.module("@superset/db/client", () => ({
	db: {
		query: { usersSlackUsers: { findFirst: () => Promise.resolve(null) } },
		update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
		delete: () => ({ where: () => Promise.resolve() }),
	},
}));

mock.module("@superset/db/schema", () => ({
	usersSlackUsers: {},
}));

mock.module("drizzle-orm", () => ({
	and: (...args: unknown[]) => args,
	eq: (col: unknown, val: unknown) => ({ col, val }),
}));

mock.module("../events/process-app-home-opened", () => ({
	processAppHomeOpened: () => Promise.resolve(),
}));

mock.module("../constants", () => ({
	DEFAULT_SLACK_MODEL: "claude-sonnet",
}));

function makeRequest(body: string): Request {
	return new Request("http://localhost/api/integrations/slack/interactions", {
		method: "POST",
		headers: {
			"x-slack-signature": "v0=valid",
			"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
			"content-type": "application/x-www-form-urlencoded",
		},
		body,
	});
}

describe("slack/interactions POST handler", () => {
	test("returns 200 when payload field contains malformed JSON", async () => {
		const { POST } = await import("./route");
		// Slack sends interactions as URL-encoded: payload=<json>
		const body = `payload=${encodeURIComponent("{not valid json")}`;
		const req = makeRequest(body);
		const res = await POST(req);
		// Per Slack's retry policy, interactions should return 200 even on bad input
		expect(res.status).toBe(200);
	});

	test("returns 200 when payload field is truncated JSON", async () => {
		const { POST } = await import("./route");
		const body = `payload=${encodeURIComponent('{"type":"block_actions"')}`;
		const req = makeRequest(body);
		const res = await POST(req);
		expect(res.status).toBe(200);
	});

	test("returns 200 when no payload field present", async () => {
		const { POST } = await import("./route");
		const req = makeRequest("other_field=value");
		const res = await POST(req);
		expect(res.status).toBe(200);
	});
});

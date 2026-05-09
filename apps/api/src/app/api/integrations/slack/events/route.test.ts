import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-token",
		NEXT_PUBLIC_API_URL: "http://localhost:3001",
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

const publishJSON = mock(() => Promise.resolve({ messageId: "test" }));

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = publishJSON;
	},
}));

const verifySlackSignature = mock(() => true);

mock.module("../verify-signature", () => ({
	verifySlackSignature,
}));

mock.module("./process-app-home-opened", () => ({
	processAppHomeOpened: mock(() => Promise.resolve()),
}));

mock.module("./process-entity-details", () => ({
	processEntityDetails: mock(() => Promise.resolve()),
}));

mock.module("./process-link-shared", () => ({
	processLinkShared: mock(() => Promise.resolve()),
}));

const { POST } = await import("./route");

function buildRequest(body: string): Request {
	return new Request("http://localhost/api/integrations/slack/events", {
		method: "POST",
		headers: {
			"x-slack-signature": "v0=test",
			"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
		},
		body,
	});
}

describe("POST /api/integrations/slack/events", () => {
	beforeEach(() => {
		verifySlackSignature.mockClear();
		publishJSON.mockClear();
	});

	test("returns 400 instead of crashing when body is malformed JSON", async () => {
		const response = await POST(buildRequest("{not valid json"));
		expect(response.status).toBe(400);
	});

	test("returns 400 instead of crashing when body is empty", async () => {
		const response = await POST(buildRequest(""));
		expect(response.status).toBe(400);
	});

	test("still handles a valid url_verification payload", async () => {
		const response = await POST(
			buildRequest(
				JSON.stringify({ type: "url_verification", challenge: "abc123" }),
			),
		);
		expect(response.status).toBe(200);
		const json = (await response.json()) as { challenge: string };
		expect(json.challenge).toBe("abc123");
	});
});

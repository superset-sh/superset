import { describe, expect, mock, test } from "bun:test";

// Mock heavy dependencies before importing the route handler
mock.module("@/env", () => ({
	env: {
		QSTASH_TOKEN: "test-token",
		NEXT_PUBLIC_API_URL: "http://localhost:3001",
		SLACK_SIGNING_SECRET: "test-secret",
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: () => true,
}));

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON() {
			return Promise.resolve({});
		}
	},
}));

mock.module("./process-app-home-opened", () => ({
	processAppHomeOpened: () => Promise.resolve(),
}));
mock.module("./process-entity-details", () => ({
	processEntityDetails: () => Promise.resolve(),
}));
mock.module("./process-link-shared", () => ({
	processLinkShared: () => Promise.resolve(),
}));

function makeRequest(body: string): Request {
	return new Request("http://localhost/api/integrations/slack/events", {
		method: "POST",
		headers: {
			"x-slack-signature": "v0=valid",
			"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
			"content-type": "text/plain",
		},
		body,
	});
}

describe("slack/events POST handler", () => {
	test("returns 400 when body is malformed JSON", async () => {
		const { POST } = await import("./route");
		const req = makeRequest("{not valid json");
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	test("returns 400 when body is an empty string", async () => {
		const { POST } = await import("./route");
		const req = makeRequest("");
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	test("returns 200 for valid url_verification payload", async () => {
		const { POST } = await import("./route");
		const req = makeRequest(
			JSON.stringify({ type: "url_verification", challenge: "abc123" }),
		);
		const res = await POST(req);
		expect(res.status).toBe(200);
	});
});

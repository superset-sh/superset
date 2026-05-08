import { describe, expect, mock, test } from "bun:test";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.NODE_ENV = "test";

mock.module("@upstash/qstash", () => ({
	Client: class {
		publishJSON = mock(() => Promise.resolve({}));
	},
}));

mock.module("../verify-signature", () => ({
	verifySlackSignature: mock(() => true),
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

describe("POST /api/integrations/slack/events", () => {
	test("returns 400 when body is not valid JSON", async () => {
		const request = new Request(
			"https://example.com/api/integrations/slack/events",
			{
				method: "POST",
				headers: {
					"x-slack-signature": "v0=test",
					"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
				},
				body: "{not valid json",
			},
		);

		const response = await POST(request);
		expect(response.status).toBe(400);
	});

	test("handles url_verification challenge for valid JSON", async () => {
		const request = new Request(
			"https://example.com/api/integrations/slack/events",
			{
				method: "POST",
				headers: {
					"x-slack-signature": "v0=test",
					"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
				},
				body: JSON.stringify({
					type: "url_verification",
					challenge: "abc123",
				}),
			},
		);

		const response = await POST(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ challenge: "abc123" });
	});
});

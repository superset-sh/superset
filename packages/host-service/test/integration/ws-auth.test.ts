import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTestHost, type TestHost } from "../helpers/createTestHost";

describe("websocket route auth", () => {
	let host: TestHost;

	beforeEach(async () => {
		host = await createTestHost();
	});

	afterEach(async () => {
		await host.dispose();
	});

	test("/events rejects requests without auth header or token", async () => {
		const res = await host.fetch("http://host-service.test/events");
		expect(res.status).toBe(401);
	});

	test("/events rejects requests with a wrong token query param", async () => {
		const res = await host.fetch("http://host-service.test/events?token=wrong");
		expect(res.status).toBe(401);
	});

	test("/events accepts a valid token via query param (no upgrade header → 426/200/etc, just not 401)", async () => {
		const res = await host.fetch(
			`http://host-service.test/events?token=${encodeURIComponent(host.psk)}`,
		);
		// Without a real WS upgrade Hono won't 101-switch, but auth must pass:
		// the 401 path is what we're guarding against, anything else means
		// auth succeeded.
		expect(res.status).not.toBe(401);
	});

	test("/terminal/* rejects requests without auth", async () => {
		const res = await host.fetch(
			"http://host-service.test/terminal/some-id?workspaceId=ws-1",
		);
		expect(res.status).toBe(401);
	});
});

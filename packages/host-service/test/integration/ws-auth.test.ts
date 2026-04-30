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

	test("/events with a valid token query param passes auth and falls through to the WS-upgrade handler", async () => {
		const res = await host.fetch(
			`http://host-service.test/events?token=${encodeURIComponent(host.psk)}`,
		);
		// Without an `Upgrade: websocket` header Hono's WS handler doesn't
		// 101-switch and the route falls through to the default 404. The
		// point of this test: auth passed (no 401) AND we hit the WS
		// route (no 5xx). Both 404 and 426 signal that — be explicit so a
		// future change to a 5xx fails this test instead of silently
		// passing.
		expect([404, 426]).toContain(res.status);
	});

	test("/terminal/* rejects requests without auth", async () => {
		const res = await host.fetch(
			"http://host-service.test/terminal/some-id?workspaceId=ws-1",
		);
		expect(res.status).toBe(401);
	});
});

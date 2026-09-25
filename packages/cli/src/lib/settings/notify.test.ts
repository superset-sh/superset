import { afterEach, describe, expect, test } from "bun:test";
import { notifyDesktopSettingsChanged } from "./notify";

let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
	server?.stop(true);
	server = undefined;
	delete process.env.DESKTOP_NOTIFICATIONS_PORT;
});

describe("desktop settings nudge", () => {
	test("returns true when a desktop app acknowledges", async () => {
		let hit = false;
		server = Bun.serve({
			port: 0,
			fetch: (req) => {
				hit = new URL(req.url).pathname === "/settings-changed";
				return new Response(JSON.stringify({ success: true }));
			},
		});
		process.env.DESKTOP_NOTIFICATIONS_PORT = String(server.port);
		expect(await notifyDesktopSettingsChanged()).toBe(true);
		expect(hit).toBe(true);
	});

	test("returns false when nothing is listening", async () => {
		process.env.DESKTOP_NOTIFICATIONS_PORT = "9";
		expect(await notifyDesktopSettingsChanged()).toBe(false);
	});

	test("returns false on non-2xx (older app without the endpoint)", async () => {
		server = Bun.serve({
			port: 0,
			fetch: () => new Response("not found", { status: 404 }),
		});
		process.env.DESKTOP_NOTIFICATIONS_PORT = String(server.port);
		expect(await notifyDesktopSettingsChanged()).toBe(false);
	});
});

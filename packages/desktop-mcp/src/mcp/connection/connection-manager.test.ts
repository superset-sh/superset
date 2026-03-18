import { afterEach, describe, expect, mock, test } from "bun:test";

/**
 * Tests for ConnectionManager CDP port handling.
 * Related to: https://github.com/anthropics/superset/issues/2568
 *
 * Verifies that the connection manager requires an explicit port via
 * DESKTOP_AUTOMATION_PORT and no longer falls back to a hardcoded default.
 */

// Mock puppeteer-core so we can test without a real CDP endpoint
const mockConnect = mock(() =>
	Promise.resolve({
		pages: mock(() =>
			Promise.resolve([
				{
					url: () => "http://localhost:5173/",
					on: mock(() => {}),
				},
			]),
		),
		connected: true,
		on: mock(() => {}),
	}),
);

mock.module("puppeteer-core", () => ({
	default: {
		connect: mockConnect,
	},
}));

// Mock sibling modules
mock.module("../console-capture/index.js", () => ({
	ConsoleCapture: class {
		attach = mock(() => {});
	},
}));
mock.module("../focus-lock/index.js", () => ({
	FocusLock: class {
		attach = mock(() => {});
		inject = mock(() => Promise.resolve());
	},
}));

describe("ConnectionManager (#2568)", () => {
	afterEach(() => {
		delete process.env.DESKTOP_AUTOMATION_PORT;
		mockConnect.mockClear();
	});

	test("throws when DESKTOP_AUTOMATION_PORT is not set", async () => {
		delete process.env.DESKTOP_AUTOMATION_PORT;

		const { ConnectionManager } = await import("./connection-manager.js");
		const manager = new ConnectionManager();

		expect(manager.getPage()).rejects.toThrow(
			"DESKTOP_AUTOMATION_PORT is not set",
		);
	});

	test("connects to the specified port when DESKTOP_AUTOMATION_PORT is set", async () => {
		process.env.DESKTOP_AUTOMATION_PORT = "55555";

		const { ConnectionManager } = await import("./connection-manager.js");
		const manager = new ConnectionManager();

		await manager.getPage();

		expect(mockConnect).toHaveBeenCalledWith(
			expect.objectContaining({
				browserURL: "http://127.0.0.1:55555",
			}),
		);
	});

	test("does not use hardcoded port 41729 as fallback", async () => {
		delete process.env.DESKTOP_AUTOMATION_PORT;

		const { ConnectionManager } = await import("./connection-manager.js");
		const manager = new ConnectionManager();

		try {
			await manager.getPage();
		} catch {
			// Expected to throw
		}

		// Verify puppeteer was never called with the old hardcoded port
		for (const call of mockConnect.mock.calls) {
			const opts = call[0] as { browserURL?: string };
			if (opts?.browserURL) {
				expect(opts.browserURL).not.toContain("41729");
			}
		}
	});
});

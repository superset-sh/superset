import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { refreshAccessToken, shouldOpenBrowser } from "./auth";

describe("shouldOpenBrowser detection", () => {
	const originalEnv = process.env;
	const originalPlatform = process.platform;
	const originalIsTTY = process.stdout.isTTY;

	beforeEach(() => {
		process.env = { ...originalEnv };
		process.stdout.isTTY = true;
	});

	afterEach(() => {
		process.env = originalEnv;
		process.stdout.isTTY = originalIsTTY;
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			writable: true,
			configurable: true,
		});
	});

	test("AC-2a: shouldOpenBrowser returns false with SSH_CONNECTION set (regression)", () => {
		Object.defineProperty(process, "platform", {
			value: "darwin",
			writable: true,
			configurable: true,
		});
		process.env = {
			SSH_CONNECTION: "192.168.1.1 22 192.168.1.100 22",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-2b: shouldOpenBrowser returns false with SSH_TTY set (regression)", () => {
		Object.defineProperty(process, "platform", {
			value: "darwin",
			writable: true,
			configurable: true,
		});
		process.env = {
			SSH_TTY: "pts/0",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-2c: shouldOpenBrowser returns true when SSH_* not set (regression baseline)", () => {
		// Pin platform to darwin so this test isolates SSH detection — without
		// the pin, on Linux CI the Linux-headless branch (no DISPLAY) would
		// satisfy the assertion for the wrong reason.
		Object.defineProperty(process, "platform", {
			value: "darwin",
			writable: true,
			configurable: true,
		});
		process.env = {};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(true);
	});

	test("AC-3: shouldOpenBrowser returns false on Linux with DISPLAY and WAYLAND_DISPLAY both unset", () => {
		Object.defineProperty(process, "platform", {
			value: "linux",
			writable: true,
			configurable: true,
		});

		process.env = {};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-3: shouldOpenBrowser returns true on Linux if DISPLAY is set", () => {
		Object.defineProperty(process, "platform", {
			value: "linux",
			writable: true,
			configurable: true,
		});

		process.env = {
			DISPLAY: ":0",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(true);
	});

	test("AC-3: shouldOpenBrowser returns true on Linux if WAYLAND_DISPLAY is set", () => {
		Object.defineProperty(process, "platform", {
			value: "linux",
			writable: true,
			configurable: true,
		});

		process.env = {
			WAYLAND_DISPLAY: "wayland-0",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(true);
	});

	test("AC-3: shouldOpenBrowser returns true on non-Linux even with DISPLAY unset", () => {
		Object.defineProperty(process, "platform", {
			value: "darwin",
			writable: true,
			configurable: true,
		});

		process.env = {};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(true);
	});
});

describe("LoginUI pasteOnly prop branching", () => {
	test("AC-8: LoginUI renders paste-primary copy when pasteOnly=true", async () => {
		const { render } = await import("ink-testing-library");
		const { LoginUI } = await import("../commands/auth/login/LoginUI");
		const React = await import("react");

		const { lastFrame } = render(
			React.createElement(LoginUI, {
				pasteOnly: true,
				url: "https://app.superset.sh/auth?code=xyz&state=abc",
				status: "waiting",
				onSubmit: () => {},
				onCancel: () => {},
				onCopy: async () => true,
			}),
		);

		const frame = lastFrame() ?? "";
		// pasteOnly branch should show the domain-aware copy
		expect(frame).toContain("Sign in to");
		expect(frame).toContain("app.superset.sh");
		// Should NOT show the browser fallback copy
		expect(frame).not.toContain("Browser didn't open");
	});

	test("AC-8: LoginUI renders browser-fallback copy when pasteOnly=false", async () => {
		const { render } = await import("ink-testing-library");
		const { LoginUI } = await import("../commands/auth/login/LoginUI");
		const React = await import("react");

		const { lastFrame } = render(
			React.createElement(LoginUI, {
				pasteOnly: false,
				url: "https://app.superset.sh/auth?code=xyz&state=abc",
				status: "waiting",
				onSubmit: () => {},
				onCancel: () => {},
				onCopy: async () => false,
			}),
		);

		const frame = lastFrame() ?? "";
		// Browser fallback branch
		expect(frame).toContain("Browser didn't open");
		// Should NOT show paste-primary copy with domain
		expect(frame).not.toContain("Sign in to");
	});
});

describe("refreshAccessToken", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("sanitizes OAuth refresh failure details (regression)", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						error: "invalid_grant",
						access_token: "access-secret",
						refresh_token: "refresh-secret",
						redirect: "https://app.superset.test/callback?code=code-secret",
						cookie: "session=session-secret",
					}),
					{ status: 400 },
				),
		) as unknown as typeof fetch;

		let thrown: unknown;
		try {
			await refreshAccessToken("refresh-secret");
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(CLIError);
		const error = thrown as CLIError;
		const visibleText = `${error.message} ${error.suggestion ?? ""}`;
		expect(visibleText).toContain("Token refresh failed: 400");
		expect(visibleText).toContain("superset auth login");
		expect(visibleText).not.toContain("access-secret");
		expect(visibleText).not.toContain("refresh-secret");
		expect(visibleText).not.toContain("session-secret");
		expect(visibleText).not.toContain("code-secret");
	});
});

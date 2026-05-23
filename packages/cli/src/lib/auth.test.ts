import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type LoginCallbacks, shouldOpenBrowser } from "./auth";

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

	test("AC-1: shouldOpenBrowser returns false when SUPERSET_WORKSPACE_ID is set", () => {
		process.env = {
			SUPERSET_WORKSPACE_ID: "ws-12345",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-2a: shouldOpenBrowser returns false with SSH_CONNECTION set (regression)", () => {
		process.env = {
			SSH_CONNECTION: "192.168.1.1 22 192.168.1.100 22",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-2b: shouldOpenBrowser returns false with SSH_TTY set (regression)", () => {
		process.env = {
			SSH_TTY: "pts/0",
		};
		process.stdout.isTTY = true;

		const result = shouldOpenBrowser();
		expect(result).toBe(false);
	});

	test("AC-2c: shouldOpenBrowser returns true when SSH_* not set (regression baseline)", () => {
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

describe("LoginCallbacks interface", () => {
	test("AC-7: LoginCallbacks type accepts noBrowser field", () => {
		// Compile-time check: If noBrowser were removed from LoginCallbacks,
		// this would fail to compile since we explicitly type-check it below.
		// This ensures the interface shape is verified at compile time.
		const validCb: LoginCallbacks = {
			noBrowser: true,
			onAuthorizationUrl: (url: string) => console.log(url),
			promptForPastedCode: async () => "code#state",
		};

		expect(validCb).toHaveProperty("noBrowser");
		expect(validCb.noBrowser).toBe(true);
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

describe("derivePasteOnly helper (AC-10: both trigger conditions independently)", () => {
	test("AC-10a: --no-browser forces pasteOnly even when browser is available", async () => {
		const { derivePasteOnly } = await import(
			"../commands/auth/login/derivePasteOnly"
		);
		expect(derivePasteOnly({ noBrowser: true }, true)).toBe(true);
	});

	test("AC-10b: auto-detected cross-device forces pasteOnly with no flag", async () => {
		const { derivePasteOnly } = await import(
			"../commands/auth/login/derivePasteOnly"
		);
		expect(derivePasteOnly({ noBrowser: false }, false)).toBe(true);
	});

	test("AC-10c: local TTY with no flag does NOT force pasteOnly", async () => {
		const { derivePasteOnly } = await import(
			"../commands/auth/login/derivePasteOnly"
		);
		expect(derivePasteOnly({ noBrowser: false }, true)).toBe(false);
	});

	test("AC-10d: both triggers active still result in pasteOnly", async () => {
		const { derivePasteOnly } = await import(
			"../commands/auth/login/derivePasteOnly"
		);
		expect(derivePasteOnly({ noBrowser: true }, false)).toBe(true);
	});

	test("AC-10e: undefined noBrowser is treated as false", async () => {
		const { derivePasteOnly } = await import(
			"../commands/auth/login/derivePasteOnly"
		);
		expect(derivePasteOnly({}, true)).toBe(false);
		expect(derivePasteOnly({}, false)).toBe(true);
	});
});

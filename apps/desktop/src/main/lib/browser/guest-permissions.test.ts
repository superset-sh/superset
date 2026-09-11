import { describe, expect, test } from "bun:test";
import {
	installGuestPermissionPolicy,
	isGuestSubject,
	shouldGrantPermission,
} from "./guest-permissions";
import { markBrowserPanePopup } from "./popup-window";

function contentsOf(type: "window" | "webview") {
	return { getType: () => type } as Electron.WebContents;
}

describe("isGuestSubject", () => {
	test("the app's own top-level document is not a guest", () => {
		expect(
			isGuestSubject({ contents: contentsOf("window"), isMainFrame: true }),
		).toBe(false);
	});

	test("a webview guest, a pane popup, a subframe, and a worker are guests", () => {
		expect(
			isGuestSubject({ contents: contentsOf("webview"), isMainFrame: true }),
		).toBe(true);
		const popup = contentsOf("window");
		markBrowserPanePopup(popup);
		expect(isGuestSubject({ contents: popup, isMainFrame: true })).toBe(true);
		expect(
			isGuestSubject({ contents: contentsOf("window"), isMainFrame: false }),
		).toBe(true);
		expect(isGuestSubject({ contents: null, isMainFrame: true })).toBe(true);
	});

	test("a destroyed webContents counts as a guest", () => {
		const destroyed = {
			getType: () => {
				throw new Error("Object has been destroyed");
			},
		} as unknown as Electron.WebContents;
		expect(isGuestSubject({ contents: destroyed, isMainFrame: true })).toBe(
			true,
		);
	});
});

describe("shouldGrantPermission", () => {
	const guest = { contents: contentsOf("webview"), isMainFrame: true };
	const app = { contents: contentsOf("window"), isMainFrame: true };

	test("denies privacy- and hardware-sensitive permissions to a guest", () => {
		for (const permission of [
			"media",
			"geolocation",
			"notifications",
			"display-capture",
			"clipboard-read",
			"openExternal",
			"pointerLock",
			"midiSysex",
			"fileSystem",
			"unknown",
		]) {
			expect(shouldGrantPermission(guest, permission)).toBe(false);
		}
	});

	test("lets a guest use the benign browsing permissions", () => {
		expect(shouldGrantPermission(guest, "fullscreen")).toBe(true);
		expect(shouldGrantPermission(guest, "clipboard-sanitized-write")).toBe(
			true,
		);
	});

	test("keeps the app document on Electron's default: everything granted", () => {
		expect(shouldGrantPermission(app, "media")).toBe(true);
		expect(shouldGrantPermission(app, "clipboard-read")).toBe(true);
	});
});

describe("installGuestPermissionPolicy", () => {
	test("installs both handlers once per session and they agree", () => {
		type RequestHandler = NonNullable<
			Parameters<Electron.Session["setPermissionRequestHandler"]>[0]
		>;
		type CheckHandler = NonNullable<
			Parameters<Electron.Session["setPermissionCheckHandler"]>[0]
		>;
		const handlers: { request?: RequestHandler; check?: CheckHandler } = {};
		let installs = 0;
		const ses = {
			setPermissionRequestHandler: (handler: RequestHandler) => {
				handlers.request = handler;
				installs++;
			},
			setPermissionCheckHandler: (handler: CheckHandler) => {
				handlers.check = handler;
				installs++;
			},
		} as unknown as Electron.Session;

		installGuestPermissionPolicy(ses);
		installGuestPermissionPolicy(ses);
		expect(installs).toBe(2);
		const requestHandler = handlers.request as RequestHandler;
		const checkHandler = handlers.check as CheckHandler;

		const granted: boolean[] = [];
		requestHandler(
			contentsOf("webview"),
			"media",
			(ok: boolean) => granted.push(ok),
			{
				isMainFrame: true,
				requestingUrl: "https://example.com",
			},
		);
		requestHandler(
			contentsOf("window"),
			"media",
			(ok: boolean) => granted.push(ok),
			{
				isMainFrame: true,
				requestingUrl: "file:///app/index.html",
			},
		);
		expect(granted).toEqual([false, true]);

		expect(
			checkHandler(contentsOf("webview"), "geolocation", "https://x", {
				isMainFrame: true,
			}),
		).toBe(false);
		expect(
			checkHandler(null, "notifications", "https://x", {
				isMainFrame: true,
			}),
		).toBe(false);
		expect(
			checkHandler(contentsOf("window"), "geolocation", "file://", {
				isMainFrame: true,
			}),
		).toBe(true);
	});
});

import { describe, expect, it } from "bun:test";
import { decideWindowOpen } from "./decide-window-open";

describe("decideWindowOpen", () => {
	it("escapes Cmd/Ctrl+click to the system browser (issue #4284)", () => {
		// Chromium reports Cmd+click (macOS) and Ctrl+click (Win/Linux) as
		// `background-tab`. Capturing it inside the app traps users in the
		// in-app webview against the platform convention.
		expect(decideWindowOpen("https://example.com", "background-tab")).toEqual({
			kind: "external",
			url: "https://example.com",
		});
	});

	it("keeps plain target=_blank clicks in the in-app webview", () => {
		expect(decideWindowOpen("https://example.com", "foreground-tab")).toEqual({
			kind: "in-app",
			url: "https://example.com",
		});
	});

	it("keeps the default disposition in the in-app webview", () => {
		expect(decideWindowOpen("https://example.com", "default")).toEqual({
			kind: "in-app",
			url: "https://example.com",
		});
	});

	it("ignores about:blank and empty URLs", () => {
		expect(decideWindowOpen("about:blank", "foreground-tab")).toEqual({
			kind: "ignore",
		});
		expect(decideWindowOpen("", "foreground-tab")).toEqual({ kind: "ignore" });
		expect(decideWindowOpen(undefined, "foreground-tab")).toEqual({
			kind: "ignore",
		});
	});
});

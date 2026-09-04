import { describe, expect, it } from "bun:test";
import { resolveZoomTarget } from "./resolveZoomTarget";

const el = (className = "") =>
	({ classList: { contains: (c: string) => className === c } }) as Element;
const noPane = () => null;

describe("resolveZoomTarget", () => {
	it("targets the terminal when xterm's textarea has focus", () => {
		expect(resolveZoomTarget(el("xterm-helper-textarea"), noPane)).toEqual({
			kind: "terminal",
		});
	});

	it("targets the browser pane whose webview has focus", () => {
		const webview = el();
		expect(
			resolveZoomTarget(webview, (e) => (e === webview ? "pane-1" : null)),
		).toEqual({ kind: "browser", paneId: "pane-1" });
	});

	it("falls back to the app for any other focus, or none", () => {
		expect(resolveZoomTarget(el("some-input"), noPane)).toEqual({
			kind: "app",
		});
		expect(resolveZoomTarget(null, noPane)).toEqual({ kind: "app" });
	});
});

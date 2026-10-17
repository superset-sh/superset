import { describe, expect, test } from "bun:test";
import { visibleClipPath } from "./visibleClipPath";

const box = { top: 0, left: 100, width: 400, height: 300 };

describe("visibleClipPath", () => {
	test("leaves a fully visible webview unclipped", () => {
		expect(
			visibleClipPath(box, [{ top: 0, left: 0, width: 1000, height: 800 }]),
		).toBe("");
	});

	test("trims the part a sliding panel has not revealed yet", () => {
		expect(
			visibleClipPath(box, [{ top: 0, left: 350, width: 650, height: 800 }]),
		).toBe("inset(0px 0px 0px 250px)");
	});

	test("hides the webview when its container has no width", () => {
		expect(
			visibleClipPath(box, [{ top: 0, left: 500, width: 0, height: 800 }]),
		).toBe("inset(50%)");
	});
});

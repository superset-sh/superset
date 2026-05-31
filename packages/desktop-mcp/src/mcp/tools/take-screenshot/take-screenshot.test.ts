import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { resolveScreenshotPath } from "./take-screenshot";

describe("resolveScreenshotPath", () => {
	it("resolves workspace-relative png paths", () => {
		expect(
			resolveScreenshotPath(".trellis/artifacts/screen.png", "/repo"),
		).toBe(resolve("/repo/.trellis/artifacts/screen.png"));
	});

	it("rejects paths outside the workspace", () => {
		expect(() => resolveScreenshotPath("../screen.png", "/repo")).toThrow(
			/inside the repository workspace/,
		);
	});

	it("rejects non-png paths", () => {
		expect(() => resolveScreenshotPath("screen.jpg", "/repo")).toThrow(
			/end with \.png/,
		);
	});
});

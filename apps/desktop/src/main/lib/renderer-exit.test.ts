import { describe, expect, test } from "bun:test";
import { isExpectedRendererExit } from "./renderer-exit";

describe("isExpectedRendererExit", () => {
	test("treats normal lifecycle terminations as expected", () => {
		expect(isExpectedRendererExit("clean-exit")).toBe(true);
		expect(isExpectedRendererExit("killed")).toBe(true);
	});

	// The whole point of the filter is that it must not swallow these.
	test("keeps reporting every genuine renderer fault", () => {
		for (const reason of [
			"crashed",
			"oom",
			"launch-failed",
			"integrity-failure",
			"abnormal-exit",
		]) {
			expect(isExpectedRendererExit(reason)).toBe(false);
		}
	});

	test("reports an unrecognised reason rather than assuming it is benign", () => {
		expect(isExpectedRendererExit("some-future-electron-reason")).toBe(false);
		expect(isExpectedRendererExit("")).toBe(false);
	});
});

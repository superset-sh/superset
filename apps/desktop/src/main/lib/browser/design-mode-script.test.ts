import { describe, expect, test } from "bun:test";
import { buildDesignModeScript } from "./design-mode-script";

describe("buildDesignModeScript", () => {
	test("arm script emits every payload field the clamp expects", () => {
		const arm = buildDesignModeScript("arm");
		// Fields silently dropped here reach the renderer as null forever —
		// reactProps shipped dead once because extractPayload never emitted it.
		for (const field of [
			"reactComponents: react.reactComponents",
			"reactProps: react.reactProps",
			"sourceFile: react.sourceFile",
			"htmlSnippet:",
			"computedStyles:",
			"rectViewport:",
		]) {
			expect(arm).toContain(field);
		}
	});

	test("awaitClick resolves the cancellation marker main classifies", () => {
		expect(buildDesignModeScript("awaitClick")).toContain(
			"__supersetDesignCancelled: true",
		);
	});
});

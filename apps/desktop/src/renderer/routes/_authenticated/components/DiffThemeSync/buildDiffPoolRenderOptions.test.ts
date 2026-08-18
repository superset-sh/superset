import { describe, expect, it } from "bun:test";
import { getDiffsTheme } from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { darkTheme, monokaiTheme } from "shared/themes";
import { buildDiffPoolRenderOptions } from "./buildDiffPoolRenderOptions";

describe("buildDiffPoolRenderOptions", () => {
	it("uses the diffs theme name for the active theme", () => {
		const options = buildDiffPoolRenderOptions(darkTheme);
		expect(options.theme).toBe(getDiffsTheme(darkTheme));
	});

	it("derives a distinct theme name per theme", () => {
		expect(buildDiffPoolRenderOptions(darkTheme).theme).not.toBe(
			buildDiffPoolRenderOptions(monokaiTheme).theme,
		);
	});

	it("restates the tokenize/diff intent from useDiffCodeViewTheme", () => {
		const options = buildDiffPoolRenderOptions(darkTheme);
		expect(options.lineDiffType).toBe("word-alt");
		expect(options.maxLineDiffLength).toBe(5_000);
		expect(options.tokenizeMaxLineLength).toBe(5_000);
	});
});

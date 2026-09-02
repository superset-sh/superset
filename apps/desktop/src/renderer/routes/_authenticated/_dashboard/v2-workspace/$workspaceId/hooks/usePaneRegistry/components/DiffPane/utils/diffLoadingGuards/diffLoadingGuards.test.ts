import { describe, expect, test } from "bun:test";
import {
	isDiffContentTooLarge,
	isGeneratedDiffFile,
} from "./diffLoadingGuards";

describe("diff loading guards", () => {
	test("treats lockfiles and compiled artifacts as generated", () => {
		for (const path of [
			"bun.lock",
			"package-lock.json",
			"dist/app.js",
			"src/vendor/client.ts",
			"assets/app.min.css",
			"packages/i18n/locales/ja/messages.ts",
		]) {
			expect(isGeneratedDiffFile(path)).toBe(true);
		}
	});

	test("leaves ordinary source files alone", () => {
		for (const path of [
			"src/app.ts",
			"apps/desktop/src/renderer/index.tsx",
			"packages/i18n/src/locales.ts",
		]) {
			expect(isGeneratedDiffFile(path)).toBe(false);
		}
	});

	test("caps the contents hydration will pull in", () => {
		expect(
			isDiffContentTooLarge("a".repeat(250_000), "b".repeat(250_001)),
		).toBe(true);
		expect(
			isDiffContentTooLarge("a".repeat(250_000), "b".repeat(250_000)),
		).toBe(false);
	});
});

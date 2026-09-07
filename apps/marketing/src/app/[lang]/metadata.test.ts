import { describe, expect, test } from "bun:test";
import { SUPPORTED_LOCALES } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import { hasLocalizedContent, localizedAlternates } from "./metadata";

describe("indexable locale variants", () => {
	test.each([
		"/blog/parallel-coding-agents-guide",
		"/changelog/2026-03-09-codemirror-workspace",
		"/compare/superset-vs-warp",
		"/parallel-coding-agents",
		"/agent-orchestration",
		"/privacy",
		"/security",
		"/subprocessors",
		"/terms",
		"/the-production-run",
	])("consolidates untranslated content at %s", (path) => {
		for (const locale of SUPPORTED_LOCALES) {
			expect(localizedAlternates(locale, path)).toEqual({
				canonical: `${COMPANY.MARKETING_URL}${path}`,
			});
		}
		expect(hasLocalizedContent(path)).toBe(false);
	});

	test.each([
		"/",
		"/pricing",
		"/factory-2026",
		"/blog",
		"/compare",
		"/team",
	])("preserves translated pages at %s", (path) => {
		const alternates = localizedAlternates("fr", path);
		expect(alternates.canonical).toBe(
			`${COMPANY.MARKETING_URL}/fr${path === "/" ? "" : path}`,
		);
		expect(Object.keys(alternates.languages ?? {})).toHaveLength(
			SUPPORTED_LOCALES.length + 1,
		);
		expect(hasLocalizedContent(path)).toBe(true);
	});
});

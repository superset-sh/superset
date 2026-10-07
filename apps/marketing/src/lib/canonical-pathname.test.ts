import { describe, expect, test } from "bun:test";
import { canonicalPathname } from "./canonical-pathname";

describe("canonicalPathname", () => {
	test("lowercases every segment", () => {
		expect(canonicalPathname("/Careers")).toBe("/careers");
		expect(canonicalPathname("/Blog/Some-Post/")).toBe("/blog/some-post/");
	});

	test("restores the canonical casing of a locale", () => {
		expect(canonicalPathname("/zh-cn/Careers")).toBe("/zh-CN/careers");
		expect(canonicalPathname("/JA/pricing")).toBe("/ja/pricing");
		expect(canonicalPathname("/pt-BR/team")).toBe("/pt-BR/team");
	});

	test("leaves canonical paths and percent-encoded bytes unchanged", () => {
		expect(canonicalPathname("/")).toBe("/");
		expect(canonicalPathname("/zh-TW/careers")).toBe("/zh-TW/careers");
		expect(canonicalPathname("/blog/%E3%81%82")).toBe("/blog/%E3%81%82");
	});
});

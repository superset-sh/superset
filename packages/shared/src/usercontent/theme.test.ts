import { describe, expect, test } from "bun:test";
import { PAGE_THEME_CSS } from "./theme";

function selectors(css: string): string[] {
	return css
		.split("}")
		.map((block) => block.slice(0, block.lastIndexOf("{")).split("{").at(-1))
		.filter((prelude): prelude is string => Boolean(prelude?.trim()))
		.flatMap((prelude) => prelude.split(/,(?![^(]*\))/))
		.map((selector) => selector.trim());
}

describe("PAGE_THEME_CSS", () => {
	test("wraps every selector in :where() so any page selector beats it", () => {
		const all = selectors(PAGE_THEME_CSS);
		expect(all.length).toBeGreaterThan(100);
		expect(all.filter((selector) => !selector.startsWith(":where("))).toEqual(
			[],
		);
	});
});

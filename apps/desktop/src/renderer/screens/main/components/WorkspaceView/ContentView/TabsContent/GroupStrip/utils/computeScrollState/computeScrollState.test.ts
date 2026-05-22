import { describe, expect, it } from "bun:test";
import { computeScrollState } from "./computeScrollState";

describe("computeScrollState", () => {
	it("reports no overflow when the track fits within the container", () => {
		expect(
			computeScrollState({
				scrollLeft: 0,
				scrollWidth: 400,
				clientWidth: 500,
			}),
		).toEqual({
			hasOverflow: false,
			canScrollLeft: false,
			canScrollRight: false,
		});
	});

	it("reports overflow with only right enabled when scrolled fully left", () => {
		expect(
			computeScrollState({
				scrollLeft: 0,
				scrollWidth: 1200,
				clientWidth: 500,
			}),
		).toEqual({
			hasOverflow: true,
			canScrollLeft: false,
			canScrollRight: true,
		});
	});

	it("reports both directions enabled when scrolled into the middle", () => {
		expect(
			computeScrollState({
				scrollLeft: 200,
				scrollWidth: 1200,
				clientWidth: 500,
			}),
		).toEqual({
			hasOverflow: true,
			canScrollLeft: true,
			canScrollRight: true,
		});
	});

	it("reports overflow with only left enabled when scrolled fully right", () => {
		expect(
			computeScrollState({
				scrollLeft: 700,
				scrollWidth: 1200,
				clientWidth: 500,
			}),
		).toEqual({
			hasOverflow: true,
			canScrollLeft: true,
			canScrollRight: false,
		});
	});

	it("treats sub-pixel boundary noise as not scrollable", () => {
		expect(
			computeScrollState({
				scrollLeft: 0.5,
				scrollWidth: 500.5,
				clientWidth: 500,
			}),
		).toEqual({
			hasOverflow: false,
			canScrollLeft: false,
			canScrollRight: false,
		});
	});
});

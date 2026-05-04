import { describe, expect, it } from "bun:test";
import { tierFor } from "./tiers";
import type { ModifierEvent } from "./types";

function event(init: Partial<ModifierEvent> = {}): ModifierEvent {
	return {
		ctrlKey: init.ctrlKey ?? false,
		metaKey: init.metaKey ?? false,
		shiftKey: init.shiftKey ?? false,
	};
}

describe("tierFor 4-tier", () => {
	it("treats every modifier combination independently", () => {
		expect(tierFor(event(), "4-tier")).toBe("plain");
		expect(tierFor(event({ shiftKey: true }), "4-tier")).toBe("shift");
		expect(tierFor(event({ metaKey: true }), "4-tier")).toBe("meta");
		expect(tierFor(event({ ctrlKey: true }), "4-tier")).toBe("meta");
		expect(tierFor(event({ metaKey: true, shiftKey: true }), "4-tier")).toBe(
			"metaShift",
		);
		expect(tierFor(event({ ctrlKey: true, shiftKey: true }), "4-tier")).toBe(
			"metaShift",
		);
	});
});

describe("tierFor 2-tier", () => {
	it("collapses shift→plain and metaShift→meta", () => {
		expect(tierFor(event(), "2-tier")).toBe("plain");
		expect(tierFor(event({ shiftKey: true }), "2-tier")).toBe("plain");
		expect(tierFor(event({ metaKey: true }), "2-tier")).toBe("meta");
		expect(tierFor(event({ ctrlKey: true }), "2-tier")).toBe("meta");
		expect(tierFor(event({ metaKey: true, shiftKey: true }), "2-tier")).toBe(
			"meta",
		);
	});
});

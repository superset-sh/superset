import { describe, expect, it } from "bun:test";
import {
	normalizeParkedRuntimeCap,
	selectRuntimesToEvict,
} from "./terminal-runtime-eviction";

const attachedMarker = {};

function parked(id: string, lastUsedAt: number) {
	return { id, runtime: { container: null }, lastUsedAt };
}

function attached(id: string, lastUsedAt: number) {
	return { id, runtime: { container: attachedMarker }, lastUsedAt };
}

function bare(id: string) {
	return { id, runtime: null, lastUsedAt: 0 };
}

function ids(entries: { id: string }[]): string[] {
	return entries.map((entry) => entry.id);
}

describe("selectRuntimesToEvict", () => {
	it("evicts by recency, not insertion order", () => {
		// "a" was inserted first but re-used most recently
		const entries = [parked("a", 9), parked("b", 1), parked("c", 5)];
		expect(ids(selectRuntimesToEvict(entries, 2))).toEqual(["b"]);
		expect(ids(selectRuntimesToEvict(entries, 1))).toEqual(["b", "c"]);
	});

	it("returns nothing at or under the cap", () => {
		const entries = [parked("a", 1), parked("b", 2)];
		expect(selectRuntimesToEvict(entries, 2)).toEqual([]);
		expect(selectRuntimesToEvict(entries, 3)).toEqual([]);
		expect(selectRuntimesToEvict([], 1)).toEqual([]);
	});

	it("never selects attached runtimes, even when they exceed the cap", () => {
		const entries = [
			attached("a", 1),
			attached("b", 2),
			attached("c", 3),
			parked("p", 4),
		];
		expect(selectRuntimesToEvict(entries, 2)).toEqual([]);
	});

	it("attached entries do not shield parked ones past the cap", () => {
		const entries = [attached("a", 9), parked("old", 1), parked("new", 2)];
		expect(ids(selectRuntimesToEvict(entries, 1))).toEqual(["old"]);
	});

	it("ignores runtime-less entries entirely", () => {
		const entries = [bare("x"), bare("y"), parked("a", 1), parked("b", 2)];
		expect(selectRuntimesToEvict(entries, 2)).toEqual([]);
		expect(ids(selectRuntimesToEvict(entries, 1))).toEqual(["a"]);
	});

	it("never selects exempt entries, even when they are the oldest", () => {
		const entries = [parked("tui", 1), parked("a", 2), parked("b", 3)];
		const isExempt = (e: { id: string }) => e.id === "tui";
		expect(ids(selectRuntimesToEvict(entries, 2, isExempt))).toEqual(["a"]);
	});

	it("stops early when only exempt entries remain over the cap", () => {
		const entries = [parked("tui1", 1), parked("tui2", 2), parked("a", 3)];
		const isExempt = (e: { id: string }) => e.id.startsWith("tui");
		// excess is 2 but only one evictable entry exists
		expect(ids(selectRuntimesToEvict(entries, 1, isExempt))).toEqual(["a"]);
	});

	it("exempt entries still occupy the parked count", () => {
		const entries = [parked("tui", 1), parked("a", 2)];
		const isExempt = (e: { id: string }) => e.id === "tui";
		// cap 1: tui fills the single slot, so "a" must go despite being newer
		expect(ids(selectRuntimesToEvict(entries, 1, isExempt))).toEqual(["a"]);
	});
});

describe("normalizeParkedRuntimeCap", () => {
	it("floors valid values", () => {
		expect(normalizeParkedRuntimeCap(12)).toBe(12);
		expect(normalizeParkedRuntimeCap(6.9)).toBe(6);
		expect(normalizeParkedRuntimeCap(1)).toBe(1);
	});

	it("rejects non-finite and sub-1 values", () => {
		expect(normalizeParkedRuntimeCap(0)).toBeNull();
		expect(normalizeParkedRuntimeCap(-3)).toBeNull();
		expect(normalizeParkedRuntimeCap(Number.NaN)).toBeNull();
		expect(normalizeParkedRuntimeCap(Number.POSITIVE_INFINITY)).toBeNull();
	});
});

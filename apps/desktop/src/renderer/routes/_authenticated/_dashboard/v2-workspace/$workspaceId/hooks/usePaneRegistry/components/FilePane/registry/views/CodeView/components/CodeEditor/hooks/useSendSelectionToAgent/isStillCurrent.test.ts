import { describe, expect, it } from "bun:test";
import { isStillCurrent } from "./isStillCurrent";

describe("isStillCurrent (edge case #5 supersede guard)", () => {
	it("proceeds when the dispatch token still matches the current token", () => {
		// The send that captured token 1 is still the latest dispatch.
		expect(isStillCurrent(1, 1)).toBe(true);
	});

	it("is a no-op when a newer send has superseded the stale token", () => {
		// send() captured token 1, then a second send bumped the ref to 2; the
		// stale dispatch's post-success cleanup must be skipped.
		expect(isStillCurrent(1, 2)).toBe(false);
	});

	it("treats the very first dispatch (token 1 vs initial ref 0) as superseded if the ref never advanced to it", () => {
		// Defensive: a token that was never installed as current never matches.
		expect(isStillCurrent(1, 0)).toBe(false);
	});

	it("models the full supersede sequence: A dispatched, B supersedes, A resolves stale, B resolves current", () => {
		let currentToken = 0;

		// send A captures its token.
		const tokenA = ++currentToken; // 1
		// User re-highlights mid-flight; send B captures a newer token.
		const tokenB = ++currentToken; // 2

		// A's dispatch resolves last but is now stale → cleanup skipped.
		expect(isStillCurrent(tokenA, currentToken)).toBe(false);
		// B is the latest → its cleanup runs.
		expect(isStillCurrent(tokenB, currentToken)).toBe(true);
	});
});

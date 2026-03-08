import { describe, expect, it } from "bun:test";
import { tabNeedsCloseConfirmation } from "./tabs-types";

describe("tabNeedsCloseConfirmation", () => {
	it("returns true for 'working' status — agent is actively running", () => {
		// Bug: without this check, closing a tab with a working agent gives no warning
		expect(tabNeedsCloseConfirmation("working")).toBe(true);
	});

	it("returns true for 'permission' status — agent is blocked waiting for user", () => {
		// Bug: without this check, closing a tab with a pending permission prompt gives no warning
		expect(tabNeedsCloseConfirmation("permission")).toBe(true);
	});

	it("returns false for 'idle' status — no active agent", () => {
		expect(tabNeedsCloseConfirmation("idle")).toBe(false);
	});

	it("returns false for 'review' status — agent already finished", () => {
		expect(tabNeedsCloseConfirmation("review")).toBe(false);
	});

	it("returns false for null — tab has no aggregate status", () => {
		expect(tabNeedsCloseConfirmation(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(tabNeedsCloseConfirmation(undefined)).toBe(false);
	});
});

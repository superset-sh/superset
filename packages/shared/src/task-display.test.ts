import { describe, expect, it } from "bun:test";
import { getTaskDisplayId } from "./task-display";

describe("getTaskDisplayId", () => {
	it("returns externalKey when present", () => {
		expect(
			getTaskDisplayId({ slug: "abc123", externalKey: "ENG-123" }),
		).toBe("ENG-123");
	});

	it("falls back to slug when externalKey is null", () => {
		expect(getTaskDisplayId({ slug: "abc123", externalKey: null })).toBe(
			"abc123",
		);
	});

	it("falls back to slug when externalKey is undefined", () => {
		expect(getTaskDisplayId({ slug: "abc123" })).toBe("abc123");
	});

	it("falls back to slug when externalKey is empty string", () => {
		expect(getTaskDisplayId({ slug: "abc123", externalKey: "" })).toBe(
			"abc123",
		);
	});

	it("returns slug for locally-created task (no external provider)", () => {
		expect(
			getTaskDisplayId({ slug: "fix-login-bug", externalKey: null }),
		).toBe("fix-login-bug");
	});

	it("returns Linear identifier for synced task", () => {
		expect(
			getTaskDisplayId({ slug: "ENG-456", externalKey: "ENG-456" }),
		).toBe("ENG-456");
	});

	it("returns externalKey when slug differs due to collision", () => {
		expect(
			getTaskDisplayId({ slug: "ENG-123-1", externalKey: "ENG-123" }),
		).toBe("ENG-123");
	});
});

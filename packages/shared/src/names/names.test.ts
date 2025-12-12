import { describe, expect, it } from "bun:test";
import { getInitials } from "./names";

describe("getInitials", () => {
	it("returns initials from full name", () => {
		expect(getInitials("John Doe")).toBe("JD");
		expect(getInitials("alice smith")).toBe("AS");
		expect(getInitials("John Middle Doe")).toBe("JD");
	});

	it("returns single initial from single name", () => {
		expect(getInitials("John")).toBe("J");
		expect(getInitials("alice")).toBe("A");
	});

	it("handles extra whitespace", () => {
		expect(getInitials("  John   Doe  ")).toBe("JD");
		expect(getInitials("John\t\nDoe")).toBe("JD");
	});

	it("falls back to email when no name provided", () => {
		expect(getInitials(null, "john@example.com")).toBe("J");
		expect(getInitials(undefined, "alice@test.com")).toBe("A");
		expect(getInitials("", "bob@test.com")).toBe("B");
	});

	it("prefers name over email", () => {
		expect(getInitials("John Doe", "other@example.com")).toBe("JD");
	});

	it("returns empty string when no data available", () => {
		expect(getInitials()).toBe("");
		expect(getInitials(null, null)).toBe("");
		expect(getInitials("", "")).toBe("");
	});
});

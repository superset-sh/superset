import { describe, expect, it } from "bun:test";
import { extractTicketKeyFromBranch } from "./ticket-key";

describe("extractTicketKeyFromBranch", () => {
	it("extracts and uppercases a ticket key embedded in a branch", () => {
		expect(extractTicketKeyFromBranch("adelin/super-172-fix-cards")).toBe(
			"SUPER-172",
		);
		expect(extractTicketKeyFromBranch("ABC-12")).toBe("ABC-12");
		expect(extractTicketKeyFromBranch("feature/eng-9-thing")).toBe("ENG-9");
	});

	it("returns null when no key is present", () => {
		expect(extractTicketKeyFromBranch("main")).toBeNull();
		expect(extractTicketKeyFromBranch("feat/multi-window")).toBeNull();
	});

	it("ignores trailing digit-only segments that are not keys", () => {
		// "v2" style segments must not match (single letter prefix is required
		// to have at least two chars before the dash).
		expect(extractTicketKeyFromBranch("release/v2-1")).toBeNull();
	});
});

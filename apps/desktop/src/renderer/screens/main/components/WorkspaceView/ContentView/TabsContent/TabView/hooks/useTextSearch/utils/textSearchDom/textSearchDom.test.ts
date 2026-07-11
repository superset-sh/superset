import { describe, expect, it } from "bun:test";
import { getRefreshedActiveMatchIndex } from "./textSearchDom";

/**
 * Reproduces issue #3979: "Find tool broken in changes / diff preview".
 *
 * When Cmd+F search is open in the diff viewer and the user presses Enter to
 * advance to the next match, the diff DOM mutates (the match is scrolled into
 * view, which re-renders the virtualized/streaming diff). That mutation
 * triggers a re-scan of the document. The old behaviour reset the active match
 * back to index 0 on every re-scan, snapping the user back to the first
 * instance and making "next" impossible to use.
 *
 * `getRefreshedActiveMatchIndex` is the pure decision that a re-scan should
 * preserve the user's current position instead of resetting it.
 */
describe("getRefreshedActiveMatchIndex", () => {
	it("preserves the active match across a re-scan (regression for #3979)", () => {
		// User advanced to the 3rd match (index 2). A DOM mutation re-scans and
		// finds the same 5 matches — the active match must stay put, not reset.
		expect(getRefreshedActiveMatchIndex(2, 5)).toBe(2);
	});

	it("keeps the first match active when the user has not advanced", () => {
		expect(getRefreshedActiveMatchIndex(0, 5)).toBe(0);
	});

	it("clamps to the last match when the match count shrinks", () => {
		// The diff changed and now only 2 matches remain; the previously-active
		// index (4) is out of range and clamps to the last valid match.
		expect(getRefreshedActiveMatchIndex(4, 2)).toBe(1);
	});

	it("returns 0 when there are no matches", () => {
		expect(getRefreshedActiveMatchIndex(3, 0)).toBe(0);
	});

	it("guards against a negative previous index", () => {
		expect(getRefreshedActiveMatchIndex(-1, 5)).toBe(0);
	});
});

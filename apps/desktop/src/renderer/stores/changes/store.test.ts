import { describe, expect, it } from "bun:test";
import { initialState } from "./store";

// Reproduces: https://github.com/supersetapp/superset/issues/1703
// Bug: massive CPU spike when a diff has >5000 changed files or >400 commits.
//
// Root cause: `expandedSections` defaults all categories to `true`, so the
// ChangesView renders every commit/file row immediately via `.map()` with no
// virtualization.  Collapsing the sections in the UI mitigates the spike,
// which means defaulting them to collapsed would prevent it entirely.

describe("ChangesStore initialState", () => {
	it("should have the 'committed' section collapsed by default to prevent CPU spike with large diffs", () => {
		// With 400+ commits all expanded at once (no virtual list), the renderer
		// creates thousands of DOM nodes synchronously, freezing the UI.
		// Expected fix: start collapsed so rendering is deferred until user expands.
		expect(initialState.expandedSections.committed).toBe(false);
	});

	it("should have the 'against-base' section collapsed by default to prevent CPU spike with large diffs", () => {
		// With 5000+ changed files, the grouped/tree file lists render every row
		// without virtualization, causing the same CPU spike.
		// Expected fix: start collapsed so rendering is deferred until user expands.
		expect(initialState.expandedSections["against-base"]).toBe(false);
	});
});

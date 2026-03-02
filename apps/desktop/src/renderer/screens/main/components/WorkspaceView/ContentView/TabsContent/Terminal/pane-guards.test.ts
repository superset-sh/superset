import { describe, expect, it } from "bun:test";
import type { Pane } from "shared/tabs-types";
import { isPaneDestroyed } from "./pane-guards";

describe("isPaneDestroyed", () => {
	it("returns false when pane exists", () => {
		const panes = {
			"pane-1": { id: "pane-1" } as Pane,
		};

		expect(isPaneDestroyed(panes, "pane-1")).toBe(false);
	});

	it("returns true when pane is missing", () => {
		const panes = {
			"pane-1": { id: "pane-1" } as Pane,
		};

		expect(isPaneDestroyed(panes, "pane-2")).toBe(true);
	});

	it("returns true when panes map is undefined", () => {
		expect(isPaneDestroyed(undefined, "pane-1")).toBe(true);
	});
});

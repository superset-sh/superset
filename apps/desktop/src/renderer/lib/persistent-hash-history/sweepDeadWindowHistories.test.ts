import { describe, expect, test } from "bun:test";
import { selectStaleHistoryKeys } from "./sweepDeadWindowHistories";

describe("selectStaleHistoryKeys", () => {
	test("keeps history for windows that still exist", () => {
		expect(
			selectStaleHistoryKeys(
				["router-history:a", "router-history:b"],
				["a", "b"],
			),
		).toEqual([]);
	});

	test("drops history for a window that is gone", () => {
		expect(
			selectStaleHistoryKeys(["router-history:a", "router-history:b"], ["a"]),
		).toEqual(["router-history:b"]);
	});

	test("never drops the pre-multi-window record", () => {
		// The first restored window still inherits it; deleting it would lose a
		// single-window user's history on upgrade.
		expect(selectStaleHistoryKeys(["router-history"], [])).toEqual([]);
	});

	test("ignores unrelated storage keys", () => {
		expect(
			selectStaleHistoryKeys(["theme", "ph_x_posthog", "router-history:a"], []),
		).toEqual(["router-history:a"]);
	});

	test("no windows left drops every window-scoped record", () => {
		expect(
			selectStaleHistoryKeys(["router-history:a", "router-history:b"], []),
		).toEqual(["router-history:a", "router-history:b"]);
	});
});

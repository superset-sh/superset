import { describe, expect, it } from "bun:test";
import { getVisibleSidebarWorkspaces } from "./sidebarVisibility";

describe("getVisibleSidebarWorkspaces", () => {
	it("drops hidden rows regardless of which host owns the workspace", () => {
		const rows = [
			{ id: "a", isHidden: false },
			{ id: "b", isHidden: true },
			{ id: "c", sidebarState: { isHidden: true } },
			{ id: "d", sidebarState: { isHidden: null } },
		];
		expect(getVisibleSidebarWorkspaces(rows).map((row) => row.id)).toEqual([
			"a",
			"d",
		]);
	});
});

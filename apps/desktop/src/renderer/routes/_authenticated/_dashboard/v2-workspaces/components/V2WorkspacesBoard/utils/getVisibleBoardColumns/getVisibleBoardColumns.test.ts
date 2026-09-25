import { describe, expect, test } from "bun:test";
import {
	BOARD_COLUMN_ORDER,
	type BoardColumnKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/deriveBoardColumn";
import { getVisibleBoardColumns } from "./getVisibleBoardColumns";

describe("getVisibleBoardColumns", () => {
	test("hides empty archived columns when archived workspaces are hidden", () => {
		expect(getVisibleBoardColumns("none", () => 0)).toEqual([
			"idle",
			"working",
			"attention",
			"review",
		]);
	});

	test("keeps an archived column when it contains a live workspace", () => {
		expect(
			getVisibleBoardColumns("none", (column) => (column === "merged" ? 1 : 0)),
		).toContain("merged");
	});

	test("keeps all columns when an archived window is visible", () => {
		const counts = new Map<BoardColumnKey, number>();
		expect(
			getVisibleBoardColumns("week", (column) => counts.get(column) ?? 0),
		).toEqual(BOARD_COLUMN_ORDER);
	});
});

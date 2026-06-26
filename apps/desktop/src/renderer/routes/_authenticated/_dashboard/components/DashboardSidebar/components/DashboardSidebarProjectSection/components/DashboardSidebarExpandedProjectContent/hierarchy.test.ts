import { describe, expect, test } from "bun:test";
import { DASHBOARD_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME } from "./hierarchy";

describe("dashboard sidebar project child hierarchy", () => {
	test("indents project children and draws a parent relationship line", () => {
		expect(DASHBOARD_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"ml-4",
		);
		expect(DASHBOARD_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"border-l",
		);
		expect(DASHBOARD_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"pl-1",
		);
	});
});

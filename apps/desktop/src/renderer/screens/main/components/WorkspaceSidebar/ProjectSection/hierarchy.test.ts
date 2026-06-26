import { describe, expect, test } from "bun:test";
import { WORKSPACE_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME } from "./hierarchy";

describe("workspace sidebar project child hierarchy", () => {
	test("indents project children and draws a parent relationship line", () => {
		expect(WORKSPACE_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"ml-4",
		);
		expect(WORKSPACE_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"border-l",
		);
		expect(WORKSPACE_SIDEBAR_PROJECT_CHILDREN_TREE_CLASS_NAME).toContain(
			"pl-1",
		);
	});
});

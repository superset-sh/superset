import { describe, expect, test } from "bun:test";
import {
	WORKSPACE_SIDEBAR_SECTION_WORKSPACE_CONNECTOR_CLASS_NAME,
	WORKSPACE_SIDEBAR_SECTION_WORKSPACE_ROW_CLASS_NAME,
	WORKSPACE_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
	WORKSPACE_SIDEBAR_TOP_LEVEL_WORKSPACE_ROW_CLASS_NAME,
} from "./hierarchy";

describe("workspace sidebar expanded workspace row hierarchy", () => {
	test("indents top-level workspace rows below project rows and draws a connector", () => {
		expect(WORKSPACE_SIDEBAR_TOP_LEVEL_WORKSPACE_ROW_CLASS_NAME).toContain(
			"pl-8",
		);
		expect(
			WORKSPACE_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
		).toContain("absolute");
		expect(
			WORKSPACE_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
		).toContain("w-8");
	});

	test("keeps section workspace rows deeper than top-level workspace rows", () => {
		expect(WORKSPACE_SIDEBAR_SECTION_WORKSPACE_ROW_CLASS_NAME).toContain(
			"pl-10",
		);
		expect(WORKSPACE_SIDEBAR_SECTION_WORKSPACE_CONNECTOR_CLASS_NAME).toContain(
			"w-10",
		);
	});
});

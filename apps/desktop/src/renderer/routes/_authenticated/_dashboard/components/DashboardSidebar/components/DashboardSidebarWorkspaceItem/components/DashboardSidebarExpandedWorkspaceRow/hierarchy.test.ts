import { describe, expect, test } from "bun:test";
import {
	DASHBOARD_SIDEBAR_SECTION_WORKSPACE_CONNECTOR_CLASS_NAME,
	DASHBOARD_SIDEBAR_SECTION_WORKSPACE_ROW_CLASS_NAME,
	DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
	DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_ROW_CLASS_NAME,
} from "./hierarchy";

describe("dashboard sidebar expanded workspace row hierarchy", () => {
	test("indents top-level workspace rows below project rows and draws a connector", () => {
		expect(DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_ROW_CLASS_NAME).toContain(
			"pl-10",
		);
		expect(
			DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
		).toContain("absolute");
		expect(
			DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_CONNECTOR_CLASS_NAME,
		).toContain("w-10");
		expect(DASHBOARD_SIDEBAR_TOP_LEVEL_WORKSPACE_ROW_CLASS_NAME).not.toContain(
			"before:",
		);
	});

	test("keeps section workspace rows deeper than top-level workspace rows", () => {
		expect(DASHBOARD_SIDEBAR_SECTION_WORKSPACE_ROW_CLASS_NAME).toContain(
			"pl-12",
		);
		expect(DASHBOARD_SIDEBAR_SECTION_WORKSPACE_CONNECTOR_CLASS_NAME).toContain(
			"w-11",
		);
		expect(DASHBOARD_SIDEBAR_SECTION_WORKSPACE_ROW_CLASS_NAME).not.toContain(
			"before:",
		);
	});
});

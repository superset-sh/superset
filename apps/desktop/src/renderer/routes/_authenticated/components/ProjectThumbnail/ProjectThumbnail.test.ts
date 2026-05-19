import { describe, expect, test } from "bun:test";
import type { ComponentProps } from "react";
import type { ProjectThumbnail as V1ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail/ProjectThumbnail";
import type { ProjectThumbnail as V2ProjectThumbnail } from "./ProjectThumbnail";

type V1Props = ComponentProps<typeof V1ProjectThumbnail>;
type V2Props = ComponentProps<typeof V2ProjectThumbnail>;

// Regression test for https://github.com/superset-sh/superset/issues/4181.
//
// In v1, projects could be color-coded via the WorkspaceSidebar's ProjectHeader
// context menu ("Set Color" submenu) and the v1 ProjectThumbnail rendered each
// project with a colored border driven by `projectColor`. In v2, the
// DashboardSidebar's project context menu dropped that submenu and the v2
// ProjectThumbnail no longer accepts a color prop, so every project renders with
// the same muted border. The user reports that "[projects] all look pretty
// much the same" — exactly what these assertions encode.
describe("regression #4181: v2 lost project color customization", () => {
	test("v1 ProjectThumbnail accepts projectColor (baseline)", () => {
		const v1AcceptsColor: "projectColor" extends keyof V1Props ? true : false =
			true;
		expect(v1AcceptsColor).toBe(true);
	});

	test("v2 ProjectThumbnail should accept projectColor", () => {
		const v2AcceptsColor: "projectColor" extends keyof V2Props ? true : false =
			false;
		expect(v2AcceptsColor).toBe(true);
	});
});

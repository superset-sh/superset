import { describe, expect, test } from "bun:test";
import type { AutomationListRow } from "./automationListSelection";
import { mergeAutomationListRows } from "./automationListSelection";

function automation(
	overrides: Partial<AutomationListRow> = {},
): AutomationListRow {
	return {
		id: "automation-1",
		organizationId: "org-1",
		ownerUserId: "user-1",
		name: "Report",
		agent: "claude",
		targetHostId: null,
		v2ProjectId: "project-1",
		v2WorkspaceId: null,
		rrule: "FREQ=DAILY",
		dtstart: new Date("2026-06-12T09:00:00.000Z"),
		timezone: "UTC",
		enabled: true,
		mcpScope: [],
		nextRunAt: new Date("2026-06-13T09:00:00.000Z"),
		createdAt: new Date("2026-06-12T09:00:00.000Z"),
		updatedAt: new Date("2026-06-12T09:00:00.000Z"),
		...overrides,
	};
}

describe("automationListSelection", () => {
	test("merges fresh cloud rows with live Electric rows", () => {
		const live = automation({ id: "live", prompt: "local prompt" });
		const fresh = automation({
			id: "fresh",
			name: "Fresh",
			createdAt: new Date("2026-06-12T10:00:00.000Z"),
		});

		const merged = mergeAutomationListRows([live], [fresh]);

		expect(merged.map((row) => row.id)).toEqual(["fresh", "live"]);
	});

	test("preserves live prompt when fresher list summary omits it", () => {
		const live = automation({
			prompt: "cached prompt",
			updatedAt: new Date("2026-06-12T09:00:00.000Z"),
		});
		const fresh = automation({
			name: "Updated name",
			updatedAt: new Date("2026-06-12T09:05:00.000Z"),
		});

		const [merged] = mergeAutomationListRows([live], [fresh]);

		expect(merged?.name).toBe("Updated name");
		expect(merged?.prompt).toBe("cached prompt");
	});

	test("keeps newer live rows over stale fresh rows", () => {
		const live = automation({
			name: "Live",
			updatedAt: new Date("2026-06-12T09:05:00.000Z"),
		});
		const fresh = automation({
			name: "Stale",
			updatedAt: new Date("2026-06-12T09:00:00.000Z"),
		});

		const [merged] = mergeAutomationListRows([live], [fresh]);

		expect(merged?.name).toBe("Live");
	});
});

import { describe, expect, test } from "bun:test";
import { feedbackReportText } from "./feedback-report";

const report = {
	type: "bug" as const,
	title: "Terminal: pane goes blank after waking from sleep",
	body: "Summary\n- Pane goes blank\n- Every time\n\nSteps to reproduce\n1. Sleep\n2. Wake",
	userName: "Jane Doe",
	userEmail: "jane@example.com",
	userId: "user-1",
	accountCreated: "2026-07-09T00:00:00.000Z",
	organizationName: "Acme",
	organizationId: "org-1",
	plan: "pro (active)",
	appVersion: "1.26.0",
	os: "darwin 25.5.0 arm64",
};

describe("feedbackReportText", () => {
	test("keeps the report's line breaks intact", () => {
		const text = feedbackReportText(report);
		expect(text).toContain("Summary\n- Pane goes blank\n- Every time\n\n");
		expect(text).toContain("Steps to reproduce\n1. Sleep\n2. Wake");
	});

	test("carries the same metadata as the HTML email", () => {
		const text = feedbackReportText(report);
		expect(text.startsWith("Bug report · pro (active)\n")).toBe(true);
		expect(text).toContain("Reporter: Jane Doe <jane@example.com>");
		expect(text).toContain("Organization: Acme");
		expect(text).toContain("Customer since: Jul 9, 2026");
		expect(text).toContain("Environment: 1.26.0 · darwin 25.5.0 arm64");
		expect(text).toContain("User ID user-1 · Org ID org-1");
	});

	test("drops optional lines that have no value", () => {
		const text = feedbackReportText({
			...report,
			userName: undefined,
			organizationName: undefined,
			organizationId: undefined,
			accountCreated: undefined,
		});
		expect(text).not.toContain("Organization:");
		expect(text).not.toContain("Customer since:");
		expect(text).not.toContain("Org ID");
		expect(text).toContain("respond to the reporter directly");
		expect(text).toContain("Reporter: jane@example.com");
	});
});

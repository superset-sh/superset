import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSidebarStopAllAgentsButton } from "./DashboardSidebarStopAllAgentsButton";

describe("DashboardSidebarStopAllAgentsButton", () => {
	test("reads as destructive and defers to a confirm dialog", () => {
		const markup = renderToStaticMarkup(
			<DashboardSidebarStopAllAgentsButton onRequestStopAll={() => {}} />,
		);

		expect(markup).toContain("Stop all agents");
		expect(markup).toContain('aria-haspopup="dialog"');
		expect(markup).toContain("text-destructive");
		expect(markup).toContain("hover:bg-destructive/10");
	});

	test("is disabled while a stop is already in flight", () => {
		const markup = renderToStaticMarkup(
			<DashboardSidebarStopAllAgentsButton
				onRequestStopAll={() => {}}
				disabled
			/>,
		);

		expect(markup).toContain('disabled=""');
	});
});

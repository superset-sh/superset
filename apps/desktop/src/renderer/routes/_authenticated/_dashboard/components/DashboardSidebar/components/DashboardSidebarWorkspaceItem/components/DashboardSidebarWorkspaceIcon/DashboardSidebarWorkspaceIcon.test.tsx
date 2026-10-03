import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardSidebarWorkspaceIcon } from "./DashboardSidebarWorkspaceIcon";

const baseProps = {
	hostType: "local-device",
	workspaceType: "worktree",
	hostIsOnline: true,
	isActive: false,
	isCreatePending: false,
} as const;

describe("workspace PR checks", () => {
	for (const variant of ["expanded", "collapsed"] as const) {
		for (const state of ["open", "draft", "queued"] as const) {
			test(`${variant} ${state} PR exposes running and failed checks`, () => {
				for (const [checksStatus, label] of [
					["pending", "Checks running"],
					["failure", "Checks failed"],
				] as const) {
					const markup = renderToStaticMarkup(
						<DashboardSidebarWorkspaceIcon
							{...baseProps}
							variant={variant}
							pullRequestState={state}
							pullRequestChecksStatus={checksStatus}
						/>,
					);
					expect(markup).toContain(`aria-label="${label}"`);
				}
			});
		}
	}

	test("does not show stale failures for merged, closed, or missing PRs", () => {
		for (const state of ["merged", "closed", null] as const) {
			const markup = renderToStaticMarkup(
				<DashboardSidebarWorkspaceIcon
					{...baseProps}
					variant="expanded"
					pullRequestState={state}
					pullRequestChecksStatus="failure"
				/>,
			);
			expect(markup).not.toContain('aria-label="Checks failed"');
		}
	});

	test("does not add badges for successful or absent checks", () => {
		for (const checksStatus of ["success", "none", undefined] as const) {
			const markup = renderToStaticMarkup(
				<DashboardSidebarWorkspaceIcon
					{...baseProps}
					variant="expanded"
					pullRequestState="open"
					pullRequestChecksStatus={checksStatus}
				/>,
			);
			expect(markup).not.toContain('aria-label="Checks');
		}
	});

	test("keeps failed checks visible while an agent is working", () => {
		const markup = renderToStaticMarkup(
			<DashboardSidebarWorkspaceIcon
				{...baseProps}
				variant="expanded"
				workspaceStatus="working"
				pullRequestState="open"
				pullRequestChecksStatus="failure"
			/>,
		);
		expect(markup).toContain('aria-label="Checks failed"');
	});
});

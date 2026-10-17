import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardSidebarWorkspaceType } from "../../../../types";
import { DashboardSidebarWorkspaceIcon } from "./DashboardSidebarWorkspaceIcon";

function renderIcon(
	workspaceType: DashboardSidebarWorkspaceType,
	pullRequestState: "open" | null = null,
) {
	return renderToStaticMarkup(
		<DashboardSidebarWorkspaceIcon
			hostType="local-device"
			workspaceType={workspaceType}
			hostIsOnline={null}
			isActive={false}
			variant="expanded"
			isCreatePending={false}
			pullRequestState={pullRequestState}
		/>,
	);
}

test("local and worktree rows render different icons", () => {
	expect(renderIcon("local")).not.toBe(renderIcon("worktree"));
});

test("worktree rows render a different icon than the session dot", () => {
	expect(renderIcon("worktree")).not.toBe(renderIcon("session"));
});

test("a pull request icon still replaces the type icon for both row kinds", () => {
	expect(renderIcon("local", "open")).toBe(renderIcon("worktree", "open"));
});

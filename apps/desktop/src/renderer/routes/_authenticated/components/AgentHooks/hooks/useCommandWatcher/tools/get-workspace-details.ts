import { useTabsStore } from "renderer/stores/tabs/store";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	workspaceId: z.string(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const workspaces = ctx.getWorkspaces();
	if (!workspaces || workspaces.length === 0) {
		return { success: false, error: "No workspaces available" };
	}

	const workspace = workspaces.find((ws) => ws.id === params.workspaceId);
	if (!workspace) {
		return {
			success: false,
			error: `Workspace not found: ${params.workspaceId}`,
		};
	}

	const tabsStore = useTabsStore.getState();
	const activeTabId = tabsStore.activeTabIds[workspace.id] ?? null;
	const workspaceTabs = tabsStore.tabs.filter(
		(t) => t.workspaceId === workspace.id,
	);

	const tabs = workspaceTabs.map((tab) => {
		const tabPanes = Object.entries(tabsStore.panes)
			.filter(([, pane]) => pane.tabId === tab.id)
			.map(([id, pane]) => ({
				id,
				type: pane.type,
				name: pane.name,
				status: pane.status ?? "idle",
			}));

		return {
			id: tab.id,
			name: tab.userTitle ?? tab.name,
			isActive: tab.id === activeTabId,
			panes: tabPanes,
		};
	});

	return {
		success: true,
		data: {
			workspace: {
				id: workspace.id,
				name: workspace.name,
				branch: workspace.branch,
				projectId: workspace.projectId,
			},
			activeTabId,
			tabs,
		},
	};
}

export const getWorkspaceDetails: ToolDefinition<typeof schema> = {
	name: "get_workspace_details",
	schema,
	execute,
};

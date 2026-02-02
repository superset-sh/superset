import { useTabsStore } from "renderer/stores/tabs/store";
import { z } from "zod";
import type { CommandResult, ToolContext, ToolDefinition } from "./types";

const schema = z.object({
	command: z.string(),
});

async function execute(
	params: z.infer<typeof schema>,
	ctx: ToolContext,
): Promise<CommandResult> {
	const activeWorkspaceId = ctx.getActiveWorkspaceId();
	if (!activeWorkspaceId) {
		return { success: false, error: "No active workspace" };
	}

	const tabsStore = useTabsStore.getState();
	const activeTabId = tabsStore.activeTabIds[activeWorkspaceId];
	if (!activeTabId) {
		return { success: false, error: "No active tab in workspace" };
	}

	const paneId = tabsStore.addPane(activeTabId, {
		initialCommands: [params.command],
	});

	if (!paneId) {
		return { success: false, error: "Failed to add pane" };
	}

	return {
		success: true,
		data: { workspaceId: activeWorkspaceId, paneId },
	};
}

export const startClaudeSubagent: ToolDefinition<typeof schema> = {
	name: "start_claude_subagent",
	schema,
	execute,
};

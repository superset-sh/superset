import { useTabsStore } from "renderer/stores/tabs/store";
import { z } from "zod";
import type { CommandResult, ToolDefinition } from "./types";

const schema = z.object({
	command: z.string(),
	workspaceId: z.string(),
});

async function execute(
	params: z.infer<typeof schema>,
): Promise<CommandResult> {
	const { workspaceId } = params;

	const tabsStore = useTabsStore.getState();
	const activeTabId = tabsStore.activeTabIds[workspaceId];
	if (!activeTabId) {
		return { success: false, error: `No active tab in workspace "${workspaceId}"` };
	}

	const paneId = tabsStore.addPane(activeTabId, {
		initialCommands: [params.command],
	});

	if (!paneId) {
		return { success: false, error: "Failed to add pane" };
	}

	return {
		success: true,
		data: { workspaceId, paneId },
	};
}

export const startClaudeSubagent: ToolDefinition<typeof schema> = {
	name: "start_claude_subagent",
	schema,
	execute,
};

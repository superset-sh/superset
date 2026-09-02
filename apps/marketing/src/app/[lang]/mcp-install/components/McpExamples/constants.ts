import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface McpExamplePrompt {
	id: string;
	prompt: MessageDescriptor;
}

export const MCP_EXAMPLE_PROMPTS: McpExamplePrompt[] = [
	{
		id: "createTask",
		prompt: msg({
			id: "marketing.mcpInstall.example.createTask",
			message: "Create a task for fixing the login bug",
		}),
	},
	{
		id: "listTasks",
		prompt: msg({
			id: "marketing.mcpInstall.example.listTasks",
			message: "List all my assigned tasks",
		}),
	},
	{
		id: "createWorkspace",
		prompt: msg({
			id: "marketing.mcpInstall.example.createWorkspace",
			message: "Create a workspace for the auth feature on my MacBook",
		}),
	},
	{
		id: "scheduleAutomation",
		prompt: msg({
			id: "marketing.mcpInstall.example.scheduleAutomation",
			message:
				"Schedule a daily automation that triages new Linear issues at 9am",
		}),
	},
	{
		id: "pauseAutomation",
		prompt: msg({
			id: "marketing.mcpInstall.example.pauseAutomation",
			message: "Pause the nightly cleanup automation",
		}),
	},
	{
		id: "automationRuns",
		prompt: msg({
			id: "marketing.mcpInstall.example.automationRuns",
			message: "Show me the last 10 runs of my Linear triage automation",
		}),
	},
];

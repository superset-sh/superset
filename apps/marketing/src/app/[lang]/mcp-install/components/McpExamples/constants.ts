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
			message: "Create a task for fixing the login bug",
		}),
	},
	{
		id: "listTasks",
		prompt: msg({
			message: "List all my assigned tasks",
		}),
	},
	{
		id: "createWorkspace",
		prompt: msg({
			message: "Create a workspace for the auth feature on my MacBook",
		}),
	},
	{
		id: "scheduleAutomation",
		prompt: msg({
			message:
				"Schedule a daily automation that triages new Linear issues at 9am",
		}),
	},
	{
		id: "pauseAutomation",
		prompt: msg({
			message: "Pause the nightly cleanup automation",
		}),
	},
	{
		id: "automationRuns",
		prompt: msg({
			message: "Show me the last 10 runs of my Linear triage automation",
		}),
	},
];

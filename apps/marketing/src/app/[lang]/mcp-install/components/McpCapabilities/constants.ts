import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface McpCapability {
	id: string;
	category: MessageDescriptor;
	description: MessageDescriptor;
}

export const MCP_CAPABILITIES: McpCapability[] = [
	{
		id: "tasks",
		category: msg({
			message: "Tasks",
		}),
		description: msg({
			message: "List, get, create, update, and delete tasks; track status.",
		}),
	},
	{
		id: "workspaces",
		category: msg({
			message: "Workspaces",
		}),
		description: msg({
			message: "List, create, update, and delete workspaces on a host.",
		}),
	},
	{
		id: "agents",
		category: msg({
			message: "Agents",
		}),
		description: msg({
			message:
				"List agents configured on a host and launch an agent session in a workspace.",
		}),
	},
	{
		id: "terminals",
		category: msg({
			message: "Terminals",
		}),
		description: msg({
			message:
				"Create, list, send input to, read the screen of, and close terminal sessions.",
		}),
	},
	{
		id: "automations",
		category: msg({
			message: "Automations",
		}),
		description: msg({
			message:
				"Schedule recurring runs, run on demand, pause, resume, and read logs.",
		}),
	},
	{
		id: "projects",
		category: msg({
			message: "Projects",
		}),
		description: msg({
			message: "List the projects (checked-out repos) available on a host.",
		}),
	},
	{
		id: "hosts",
		category: msg({
			message: "Hosts",
		}),
		description: msg({
			message: "List the machines you have access to run workspaces on.",
		}),
	},
	{
		id: "organization",
		category: msg({
			message: "Organization",
		}),
		description: msg({
			message: "List members of your active organization.",
		}),
	},
];

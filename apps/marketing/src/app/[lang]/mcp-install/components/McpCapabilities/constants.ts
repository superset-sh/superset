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
			id: "marketing.mcpInstall.capability.tasks.category",
			message: "Tasks",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.tasks.description",
			message: "List, get, create, update, and delete tasks; track status.",
		}),
	},
	{
		id: "workspaces",
		category: msg({
			id: "marketing.mcpInstall.capability.workspaces.category",
			message: "Workspaces",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.workspaces.description",
			message: "List, create, update, and delete workspaces on a host.",
		}),
	},
	{
		id: "agents",
		category: msg({
			id: "marketing.mcpInstall.capability.agents.category",
			message: "Agents",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.agents.description",
			message:
				"List agents configured on a host and launch an agent session in a workspace.",
		}),
	},
	{
		id: "terminals",
		category: msg({
			id: "marketing.mcpInstall.capability.terminals.category",
			message: "Terminals",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.terminals.description",
			message:
				"Create, list, send input to, read the screen of, and close terminal sessions.",
		}),
	},
	{
		id: "automations",
		category: msg({
			id: "marketing.mcpInstall.capability.automations.category",
			message: "Automations",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.automations.description",
			message:
				"Schedule recurring runs, run on demand, pause, resume, and read logs.",
		}),
	},
	{
		id: "projects",
		category: msg({
			id: "marketing.mcpInstall.capability.projects.category",
			message: "Projects",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.projects.description",
			message: "List the projects (checked-out repos) available on a host.",
		}),
	},
	{
		id: "hosts",
		category: msg({
			id: "marketing.mcpInstall.capability.hosts.category",
			message: "Hosts",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.hosts.description",
			message: "List the machines you have access to run workspaces on.",
		}),
	},
	{
		id: "organization",
		category: msg({
			id: "marketing.mcpInstall.capability.organization.category",
			message: "Organization",
		}),
		description: msg({
			id: "marketing.mcpInstall.capability.organization.description",
			message: "List members of your active organization.",
		}),
	},
];

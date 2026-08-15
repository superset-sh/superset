export interface McpCapability {
	category: string;
	description: string;
}

export const MCP_CAPABILITIES: McpCapability[] = [
	{
		category: "Tasks",
		description: "List, get, create, update, and delete tasks; track status.",
	},
	{
		category: "Workspaces",
		description: "List, create, update, and delete workspaces on a host.",
	},
	{
		category: "Agents",
		description:
			"List agents configured on a host and launch an agent session in a workspace.",
	},
	{
		category: "Terminals",
		description:
			"Create, list, send input to, read the screen of, and close terminal sessions.",
	},
	{
		category: "Automations",
		description:
			"Schedule recurring runs, run on demand, pause, resume, and read logs.",
	},
	{
		category: "Projects",
		description: "List the projects (checked-out repos) available on a host.",
	},
	{
		category: "Hosts",
		description: "List the machines you have access to run workspaces on.",
	},
	{
		category: "Organization",
		description: "List members of your active organization.",
	},
];

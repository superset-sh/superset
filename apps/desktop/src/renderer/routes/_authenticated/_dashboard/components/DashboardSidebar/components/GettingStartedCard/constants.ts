import { msg } from "@lingui/core/macro";

export const GETTING_STARTED_STEPS = [
	{
		label: msg({ message: "Publish your first page" }),
		prompt:
			"Help me create and publish my first Superset page. Use the superset:page skill if available, otherwise start with `superset pages --help`. Ask what I want to share; suggest a project overview, a progress report, or an interactive explainer if I need ideas. Build a polished, self-contained HTML page inside this workspace, verify it, publish it, and give me the link. Briefly explain how readers can pin comments and how we can update the same page.",
	},
	{
		label: msg({ message: "Orchestrate your agents" }),
		prompt:
			"Help me try orchestrating agents with the Superset CLI. Use the superset:orchestrate skill if available, otherwise start with `superset --help`. Ask which project and outcome I want to work on, then propose two useful independent tasks. Once we choose the tasks, create isolated workspaces with a shared tag, launch the agents, monitor their progress, and bring back their results and anything needing my decision. Explain the key CLI commands as you use them.",
	},
	{
		label: msg({ message: "Connect your tools" }),
		prompt:
			"Help me connect a tool to Superset so my agents can use its context. Use the superset:plugins skill if available, otherwise start with `superset plugins --help`. Ask which tool I use, discover the available plugin, explain the access it needs, and guide me through its connection flow. Once connected, perform a useful read-only action using real data so I can see it working. Report any missing access clearly.",
	},
	{
		label: msg({ message: "Set up an automation" }),
		prompt:
			"Help me create a Superset automation. Use the superset:automate skill if it is available, otherwise the `superset` CLI (start with `superset automations --help`). Ask me what should run on a schedule, confirm the cadence, target project, and agent, then create the automation and trigger a first run so we can review the result together.",
	},
] as const;

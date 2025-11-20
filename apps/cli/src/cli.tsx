#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import {
	AgentAttach,
	AgentCreate,
	AgentDelete,
	AgentGet,
	AgentList,
	AgentStart,
	AgentStop,
	AgentStopAll,
	ChangeCreate,
	ChangeDelete,
	ChangeList,
	Dashboard,
	EnvCreate,
	EnvDelete,
	EnvGet,
	EnvList,
	Init,
	Panels,
	WorkspaceCreate,
	WorkspaceDelete,
	WorkspaceGet,
	WorkspaceList,
	WorkspaceUse,
} from "./commands/index";
import { AgentType, ProcessType } from "./types/process";
import { WorkspaceType } from "./types/workspace";

const program = new Command();

program
	.name("superset")
	.description(
		"Superset CLI - Manage environments, workspaces, agents, and changes",
	)
	.version("0.1.0");

// Init command
program
	.command("init")
	.description("Interactive workspace creation wizard")
	.action(() => {
		render(<Init />);
	});

// Dashboard command
program
	.command("dashboard")
	.description("Show dashboard with all agents and workspaces")
	.action(() => {
		render(<Dashboard />);
	});

// Panels command
program
	.command("panels")
	.description("Show three-panel IDE-style interface")
	.action(() => {
		render(<Panels />);
	});

// Environment commands
const env = program
	.command("env")
	.description("Manage environments (list, get, create, delete)");

env
	.command("list")
	.description("List all environments")
	.action(() => {
		render(<EnvList onComplete={() => process.exit(0)} />);
	});

env
	.command("get")
	.description("Get environment by ID")
	.argument("<id>", "Environment ID")
	.action((id: string) => {
		render(<EnvGet id={id} onComplete={() => process.exit(0)} />);
	});

env
	.command("create")
	.description("Create a new environment")
	.action(() => {
		render(<EnvCreate onComplete={() => process.exit(0)} />);
	});

env
	.command("delete")
	.description(
		"Delete an environment (cascades to workspaces, processes, changes)",
	)
	.argument("<id>", "Environment ID")
	.action((id: string) => {
		render(<EnvDelete id={id} onComplete={() => process.exit(0)} />);
	});

// Workspace commands
const workspace = program
	.command("workspace")
	.description("Manage workspaces (list, get, create, use, delete)");

workspace
	.command("list")
	.description("List all workspaces")
	.option("--env <environmentId>", "Filter by environment ID")
	.action((options: { env?: string }) => {
		render(
			<WorkspaceList
				environmentId={options.env}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

workspace
	.command("get")
	.description("Get workspace by ID")
	.argument("<id>", "Workspace ID")
	.action((id: string) => {
		render(<WorkspaceGet id={id} onComplete={() => process.exit(0)} />);
	});

workspace
	.command("create")
	.description("Create a new workspace")
	.argument("<environmentId>", "Environment ID")
	.argument(
		"<type>",
		`Workspace type (${Object.values(WorkspaceType).join(", ")})`,
	)
	.option("--path <path>", "Path for local workspace")
	.action((environmentId: string, type: string, options: { path?: string }) => {
		// Validate workspace type
		if (!Object.values(WorkspaceType).includes(type as WorkspaceType)) {
			console.error(
				`Invalid workspace type: ${type}. Must be one of: ${Object.values(WorkspaceType).join(", ")}`,
			);
			process.exit(1);
		}

		render(
			<WorkspaceCreate
				environmentId={environmentId}
				type={type as WorkspaceType}
				path={options.path}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

workspace
	.command("delete")
	.description("Delete a workspace (cascades to processes and changes)")
	.argument("<id>", "Workspace ID")
	.action((id: string) => {
		render(<WorkspaceDelete id={id} onComplete={() => process.exit(0)} />);
	});

workspace
	.command("use")
	.description("Set current workspace (updates lastUsedAt)")
	.argument("<id>", "Workspace ID")
	.action((id: string) => {
		render(<WorkspaceUse id={id} onComplete={() => process.exit(0)} />);
	});

// Agent/Process commands
const agent = program
	.command("agent")
	.description(
		"Manage agents and processes (start, stop, stop-all, list, delete)",
	);

agent
	.command("list")
	.description("List all agents/processes")
	.option("--workspace <workspaceId>", "Filter by workspace ID")
	.action((options: { workspace?: string }) => {
		render(
			<AgentList
				workspaceId={options.workspace}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

agent
	.command("get")
	.description("Get agent/process by ID")
	.argument("<id>", "Agent/Process ID")
	.action((id: string) => {
		render(<AgentGet id={id} onComplete={() => process.exit(0)} />);
	});

agent
	.command("start")
	.description(
		"Start agents (uses current workspace if no ID provided, or workspace's default agents)",
	)
	.argument("[workspaceId]", "Workspace ID (optional, uses current workspace)")
	.action((workspaceId?: string) => {
		render(<AgentStart workspaceId={workspaceId} />);
	});

agent
	.command("attach")
	.description("Attach to an agent's tmux session")
	.argument("<id>", "Agent ID or session name (e.g., agent-abc123)")
	.action((id: string) => {
		render(<AgentAttach id={id} onComplete={() => process.exit(0)} />);
	});

agent
	.command("create")
	.description("Create a new agent/process")
	.argument("<workspaceId>", "Workspace ID")
	.argument("<type>", `Process type (${Object.values(ProcessType).join(", ")})`)
	.option(
		"--agent-type <agentType>",
		`Agent type (${Object.values(AgentType).join(", ")}) - required if type is 'agent'`,
	)
	.action(
		(workspaceId: string, type: string, options: { agentType?: string }) => {
			// Validate process type
			if (!Object.values(ProcessType).includes(type as ProcessType)) {
				console.error(
					`Invalid process type: ${type}. Must be one of: ${Object.values(ProcessType).join(", ")}`,
				);
				process.exit(1);
			}

			// Validate agent type if provided
			let agentType: AgentType | undefined;
			if (options.agentType) {
				if (
					!Object.values(AgentType).includes(options.agentType as AgentType)
				) {
					console.error(
						`Invalid agent type: ${options.agentType}. Must be one of: ${Object.values(AgentType).join(", ")}`,
					);
					process.exit(1);
				}
				agentType = options.agentType as AgentType;
			}

			render(
				<AgentCreate
					workspaceId={workspaceId}
					type={type as ProcessType}
					agentType={agentType}
					onComplete={() => process.exit(0)}
				/>,
			);
		},
	);

agent
	.command("stop")
	.description("Stop an agent/process")
	.argument("<id>", "Agent/Process ID")
	.action((id: string) => {
		render(<AgentStop id={id} onComplete={() => process.exit(0)} />);
	});

agent
	.command("stop-all")
	.description(
		"Stop all agents in workspace (kills tmux sessions, does not affect terminals)",
	)
	.option("--workspace <workspaceId>", "Workspace ID to stop agents in")
	.action((options: { workspace?: string }) => {
		render(
			<AgentStopAll
				workspaceId={options.workspace}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

agent
	.command("delete")
	.description("Delete an agent/process (cascades to agent summaries)")
	.argument("<id>", "Agent/Process ID")
	.action((id: string) => {
		render(<AgentDelete id={id} onComplete={() => process.exit(0)} />);
	});

// Change commands
const change = program
	.command("change")
	.description("Manage changes (list, create, delete)");

change
	.command("list")
	.description("List changes for a workspace")
	.argument("<workspaceId>", "Workspace ID")
	.action((workspaceId: string) => {
		render(
			<ChangeList
				workspaceId={workspaceId}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

change
	.command("create")
	.description("Create a new change")
	.argument("<workspaceId>", "Workspace ID")
	.argument("<summary>", "Change summary")
	.action((workspaceId: string, summary: string) => {
		render(
			<ChangeCreate
				workspaceId={workspaceId}
				summary={summary}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

change
	.command("delete")
	.description("Delete a change (cascades to file diffs)")
	.argument("<id>", "Change ID")
	.action((id: string) => {
		render(<ChangeDelete id={id} onComplete={() => process.exit(0)} />);
	});

// Default action when no command is provided
program.action(async () => {
	console.log("\n👋 Welcome to Superset CLI!\n");

	// Show current workspace if set
	try {
		const { getDb } = await import("./lib/db");
		const { WorkspaceOrchestrator } = await import(
			"./lib/orchestrators/workspace-orchestrator"
		);
		const db = getDb();
		const orchestrator = new WorkspaceOrchestrator(db);
		const currentWorkspace = await orchestrator.getCurrent();

		if (currentWorkspace) {
			console.log(
				`📁 Current workspace: ${currentWorkspace.name || currentWorkspace.id}`,
			);
			if ("path" in currentWorkspace && currentWorkspace.path) {
				console.log(`   Path: ${currentWorkspace.path}`);
			}
			if ("branch" in currentWorkspace && currentWorkspace.branch) {
				console.log(`   Branch: ${currentWorkspace.branch}`);
			}
			console.log("");
		} else {
			console.log(
				"💡 No workspace selected. Run 'superset init' to get started!\n",
			);
		}
	} catch (err) {
		// Silently ignore errors (e.g., no database yet)
	}

	console.log("Get started with these commands:\n");
	console.log("  superset init                  Create workspace (wizard)");
	console.log("  superset dashboard             Show dashboard overview");
	console.log(
		"  superset panels                Show three-panel IDE interface",
	);
	console.log("  superset workspace use <id>    Switch to a workspace");
	console.log(
		"  superset agent start           Start agents in current workspace",
	);
	console.log("\nFor more information, run: superset --help\n");
	process.exit(0);
});

program.parse();

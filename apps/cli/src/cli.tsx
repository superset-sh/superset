#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";
import React from "react";
import {
	AgentCreate,
	AgentDelete,
	AgentGet,
	AgentList,
	AgentStop,
	AgentStopAll,
	ChangeCreate,
	ChangeDelete,
	ChangeList,
	EnvCreate,
	EnvDelete,
	EnvGet,
	EnvList,
	WorkspaceCreate,
	WorkspaceDelete,
	WorkspaceGet,
	WorkspaceList,
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

// Environment commands
const env = program.command("env").description("Manage environments");

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
const workspace = program.command("workspace").description("Manage workspaces");

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

// Agent/Process commands
const agent = program
	.command("agent")
	.description("Manage agents and processes");

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
	.description("Stop all agents/processes")
	.action(() => {
		render(<AgentStopAll onComplete={() => process.exit(0)} />);
	});

agent
	.command("delete")
	.description("Delete an agent/process (cascades to agent summaries)")
	.argument("<id>", "Agent/Process ID")
	.action((id: string) => {
		render(<AgentDelete id={id} onComplete={() => process.exit(0)} />);
	});

// Change commands
const change = program.command("change").description("Manage changes");

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

program.parse();

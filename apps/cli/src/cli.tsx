#!/usr/bin/env node
import { Command } from "commander";
import { render } from "ink";

// New simplified commands (use local-db SQLite)
import { ProjectInit } from "./commands/project";
import { Status } from "./commands/status";
import { WorktreeCreate, WorktreeDelete, WorktreeList } from "./commands/worktree";

// Keep existing agent commands for now (they still use lowdb, will be migrated in Milestone 4)
import {
	AgentAttach,
	AgentList,
	AgentStart,
	AgentStop,
	AgentStopAll,
} from "./commands/index";

const program = new Command();

program
	.name("superset")
	.description("Superset CLI - Manage projects, worktrees, and agents")
	.version("0.2.0");

// ============================================================================
// INIT COMMAND
// ============================================================================
program
	.command("init")
	.description("Initialize a project from current git repository")
	.argument("[path]", "Path to git repository (defaults to current directory)")
	.action((path?: string) => {
		render(<ProjectInit path={path} onComplete={() => process.exit(0)} />);
	});

// ============================================================================
// STATUS COMMAND
// ============================================================================
program
	.command("status")
	.description("Show current project and workspace status")
	.action(() => {
		render(<Status onComplete={() => process.exit(0)} />);
	});

// ============================================================================
// WORKTREE COMMANDS
// ============================================================================
const worktree = program
	.command("worktree")
	.description("Manage git worktrees");

worktree
	.command("create")
	.description("Create a new worktree workspace")
	.argument("[name]", "Branch name for the worktree (auto-generated if not provided)")
	.option("--base <branch>", "Base branch to create from (defaults to main/master)")
	.action((name?: string, options?: { base?: string }) => {
		render(
			<WorktreeCreate
				name={name}
				baseBranch={options?.base}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

worktree
	.command("list")
	.description("List all worktrees for the current project")
	.action(() => {
		render(<WorktreeList onComplete={() => process.exit(0)} />);
	});

worktree
	.command("delete")
	.argument("<id>", "Worktree ID or branch name")
	.description("Delete a worktree")
	.action((id: string) => {
		render(<WorktreeDelete id={id} onComplete={() => process.exit(0)} />);
	});

// ============================================================================
// AGENT COMMANDS (using existing implementation for now)
// ============================================================================
const agent = program
	.command("agent")
	.description("Manage AI coding agents (Claude, Codex, Cursor)");

agent
	.command("start")
	.description("Start an agent in the current workspace")
	.argument("[workspaceId]", "Workspace ID (uses current workspace if not provided)")
	.action((workspaceId?: string) => {
		render(<AgentStart workspaceId={workspaceId} />);
	});

agent
	.command("list")
	.description("List all running agents")
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
	.command("attach")
	.description("Attach to an agent's tmux session")
	.argument("<id>", "Agent ID or session name")
	.action((id: string) => {
		render(<AgentAttach id={id} onComplete={() => process.exit(0)} />);
	});

agent
	.command("stop")
	.description("Stop an agent")
	.argument("<id>", "Agent ID")
	.action((id: string) => {
		render(<AgentStop id={id} onComplete={() => process.exit(0)} />);
	});

agent
	.command("stop-all")
	.description("Stop all agents")
	.option("--workspace <workspaceId>", "Only stop agents in this workspace")
	.action((options: { workspace?: string }) => {
		render(
			<AgentStopAll
				workspaceId={options.workspace}
				onComplete={() => process.exit(0)}
			/>,
		);
	});

// ============================================================================
// DEFAULT ACTION (no command provided)
// ============================================================================
program.action(() => {
	// Show status by default
	render(<Status onComplete={() => process.exit(0)} />);
});

program.parse();

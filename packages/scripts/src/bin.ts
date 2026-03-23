#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { branchCommand } from "./commands/branch.js";
import { configCommand } from "./commands/config.js";
import { devCommand } from "./commands/dev.js";
import { listCommand } from "./commands/list.js";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { openCommand } from "./commands/open.js";
import { openUrlCommand } from "./commands/open-url.js";
import { prCommand } from "./commands/pr.js";
import { statusCommand } from "./commands/status.js";
import { worktreeCommand } from "./commands/worktree.js";
import { bold, dim } from "./lib/output.js";

const pkg = JSON.parse(
	readFileSync(join(import.meta.dirname, "../package.json"), "utf-8"),
);
const VERSION: string = pkg.version;

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
	printHelp();
	process.exit(0);
}

if (command === "--version" || command === "-v") {
	console.log(VERSION);
	process.exit(0);
}

const commandArgs = args.slice(1);

switch (command) {
	case "worktree":
		worktreeCommand(commandArgs);
		break;
	case "branch":
		branchCommand(commandArgs);
		break;
	case "dev":
		devCommand(commandArgs);
		break;
	case "login":
		loginCommand();
		break;
	case "logout":
		logoutCommand();
		break;
	case "status":
		statusCommand();
		break;
	case "list":
		listCommand();
		break;
	case "pr":
		prCommand();
		break;
	case "open":
		openUrlCommand(commandArgs);
		break;
	case "config":
		configCommand(commandArgs);
		break;
	default:
		// Treat as a path: superset . / superset ~/Projects/myapp
		openCommand([command, ...commandArgs]);
		break;
}

function printHelp(): void {
	console.log(`
${bold("superset")} - Superset CLI ${dim(`v${VERSION}`)}

${bold("Usage:")}
  superset <command> [options]
  superset <path>              Open a project in Superset

${bold("Commands:")}
  ${bold(".")} / ${bold("<path>")}                  Open a project by path
  ${bold("worktree")} <name> [path]      Create/open a worktree workspace
  ${bold("branch")} <name> [path]        Create/open a branch workspace
  ${bold("dev")} [port]                  Open dev server browser pane
  ${bold("login")}                       Sign in to Superset
  ${bold("logout")}                      Sign out of Superset
  ${bold("status")}                      Show project info for current directory
  ${bold("list")}                        List all known projects
  ${bold("pr")}                          Open PR view for current branch
  ${bold("open")} <url>                  Open a Superset URL in the desktop app
  ${bold("config")} [set|get|reset]      Manage CLI configuration

${bold("Options:")}
  -h, --help                   Show this help message
  -v, --version                Show version
`);
}

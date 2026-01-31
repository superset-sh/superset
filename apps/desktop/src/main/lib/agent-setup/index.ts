import fs from "node:fs";
import { cleanupGlobalOpenCodePlugin, createAllAgents } from "./agent-wrappers";
import { createNotifyScript } from "./notify-hook";
import {
	BASH_DIR,
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_PLUGIN_DIR,
	ZSH_DIR,
} from "./paths";
import {
	createBashWrapper,
	createZshWrapper,
	getShellArgs,
	getShellEnv,
} from "./shell-wrappers";

/**
 * Sets up the ~/.superset directory structure and agent wrappers
 * Called on app startup
 */
export function setupAgentHooks(): void {
	console.log("[agent-setup] Initializing agent hooks...");

	// Create directories
	fs.mkdirSync(BIN_DIR, { recursive: true });
	fs.mkdirSync(HOOKS_DIR, { recursive: true });
	fs.mkdirSync(ZSH_DIR, { recursive: true });
	fs.mkdirSync(BASH_DIR, { recursive: true });
	fs.mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });

	// Clean up stale global plugins that may cause dev/prod conflicts
	cleanupGlobalOpenCodePlugin();

	// Create notify script (used by all agents)
	createNotifyScript();

	// Create all agent wrappers and settings
	createAllAgents();

	// Create shell initialization wrappers
	createZshWrapper();
	createBashWrapper();

	console.log("[agent-setup] Agent hooks initialized");
}

/**
 * Returns the bin directory path
 */
export function getSupersetBinDir(): string {
	return BIN_DIR;
}

// Re-export shell utilities for terminal usage
export { getShellArgs, getShellEnv };

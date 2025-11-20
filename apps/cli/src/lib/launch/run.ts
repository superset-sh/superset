import { spawn } from "node:child_process";
import type { Agent } from "../../types/process";
import { getLaunchCommand } from "./config";

export interface LaunchResult {
	success: boolean;
	exitCode?: number;
	error?: string;
}

/**
 * Launch an agent by spawning its configured command
 * Returns a promise that resolves when the process exits
 */
export async function launchAgent(agent: Agent): Promise<LaunchResult> {
	const command = getLaunchCommand(agent);

	if (!command) {
		return {
			success: false,
			error: `No launch command configured for agent type "${agent.agentType}". Set SUPERSET_AGENT_LAUNCH_${agent.agentType.toUpperCase()}=<command> or add launchers in ~/.superset-cli.json`,
		};
	}

	console.log(`\nLaunching ${agent.agentType} agent...\n`);

	return new Promise((resolve) => {
		try {
			// Spawn the process with inherited stdio so user can interact
			// Use shell to properly handle the command and its arguments
			const child = spawn(command, [], {
				stdio: "inherit",
				shell: true,
				detached: false,
			});

			child.on("error", (error) => {
				resolve({
					success: false,
					error: `Failed to launch ${command}: ${error.message}`,
				});
			});

			child.on("exit", (code) => {
				if (code === 0 || code === null) {
					resolve({
						success: true,
						exitCode: code || 0,
					});
				} else {
					resolve({
						success: false,
						exitCode: code,
						error: `Process exited with code ${code}`,
					});
				}
			});
		} catch (error) {
			resolve({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});
}

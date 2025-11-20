import { exec, execSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { Agent } from "../../types/process";
import { getLaunchCommand } from "./config";

const execAsync = promisify(exec);

export interface LaunchResult {
	success: boolean;
	exitCode?: number;
	error?: string;
}

/**
 * Check if tmux is installed on the system
 */
function isTmuxInstalled(): boolean {
	try {
		execSync("which tmux", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a tmux session already exists
 */
async function tmuxSessionExists(sessionName: string): Promise<boolean> {
	try {
		await execAsync(`tmux has-session -t "${sessionName}" 2>/dev/null`);
		return true;
	} catch {
		return false;
	}
}

/**
 * Launch an agent in a tmux session (create-or-attach behavior)
 * - If session exists: attach to it
 * - If session doesn't exist: create it in detached mode and return immediately
 * - Optional attach parameter: if true, attach after creating; if false, just create and return
 */
export async function launchAgent(
	agent: Agent,
	options: { attach?: boolean } = { attach: true },
): Promise<LaunchResult> {
	const command = getLaunchCommand(agent);

	if (!command) {
		return {
			success: false,
			error: `No launch command configured for agent type "${agent.agentType}". Set SUPERSET_AGENT_LAUNCH_${agent.agentType.toUpperCase()}=<command> or add launchers in ~/.superset-cli.json`,
		};
	}

	// Check if tmux is installed
	if (!isTmuxInstalled()) {
		return {
			success: false,
			error:
				"tmux is not installed. Please install tmux to launch agents:\n  macOS: brew install tmux\n  Ubuntu/Debian: sudo apt install tmux\n  Fedora: sudo dnf install tmux",
		};
	}

	const sessionName = agent.sessionName || `agent-${agent.id.slice(0, 6)}`;

	// Check if session already exists
	const exists = await tmuxSessionExists(sessionName);

	if (exists) {
		// Session exists - attach if requested
		if (options.attach) {
			console.log(
				`\nSession "${sessionName}" exists. Attaching...\n`,
			);
			return attachToAgent(agent);
		}
		// Session exists but not attaching - just return success
		return {
			success: true,
			exitCode: 0,
		};
	}

	// Session doesn't exist - create it in detached mode
	try {
		await execAsync(`tmux new-session -d -s "${sessionName}" "${command}"`);

		if (options.attach) {
			// Created successfully, now attach
			console.log(
				`\nSession "${sessionName}" created. Attaching...\n`,
			);
			return attachToAgent(agent);
		}

		// Created but not attaching - just return success
		console.log(
			`\n✓ Agent session created: ${sessionName}\n`,
		);
		return {
			success: true,
			exitCode: 0,
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? `Failed to create tmux session: ${error.message}`
					: "Unknown error creating tmux session",
		};
	}
}

/**
 * Attach to an existing agent's tmux session
 * Inherits stdio so user can interact, returns when user detaches
 */
export async function attachToAgent(agent: Agent): Promise<LaunchResult> {
	const sessionName = agent.sessionName || `agent-${agent.id.slice(0, 6)}`;

	// Check if session exists
	const exists = await tmuxSessionExists(sessionName);
	if (!exists) {
		return {
			success: false,
			error: `Session "${sessionName}" not found. The agent may have stopped or never started.`,
		};
	}

	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║  Attaching to session: ${sessionName.padEnd(38)} ║`);
	console.log(`║                                                                ║`);
	console.log(`║  Press Ctrl-b then d to detach and keep agent running         ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

	return new Promise((resolve) => {
		try {
			// Set tmux status bar message before attaching
			try {
				execSync(
					`tmux set-option -t "${sessionName}" status-left-length 100 2>/dev/null`,
				);
				execSync(
					`tmux set-option -t "${sessionName}" status-style "bg=yellow,fg=black" 2>/dev/null`,
				);
				execSync(
					`tmux set-option -t "${sessionName}" status-left "#[bg=yellow,fg=black,bold] Ctrl-b d to detach and keep agent running #[default]" 2>/dev/null`,
				);
			} catch {
				// Ignore errors setting status bar
			}

			// Spawn tmux attach with inherited stdio
			const child = spawn("tmux", ["attach", "-t", sessionName], {
				stdio: "inherit",
				detached: false,
			});

			child.on("error", (error) => {
				resolve({
					success: false,
					error: `Failed to attach to session: ${error.message}`,
				});
			});

			child.on("exit", (code) => {
				// Exit code 0 means user detached successfully
				if (code === 0 || code === null) {
					resolve({
						success: true,
						exitCode: code || 0,
					});
				} else {
					resolve({
						success: false,
						exitCode: code,
						error: `Attach process exited with code ${code}`,
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

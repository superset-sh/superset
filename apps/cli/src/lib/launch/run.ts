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
 * Check if a tmux session already exists (synchronous to avoid hangs)
 */
function tmuxSessionExists(sessionName: string): boolean {
	try {
		execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, {
			stdio: "ignore",
		});
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
 * - Optional silent parameter: if true, suppress console output (for use with Ink overlays)
 */
export async function launchAgent(
	agent: Agent,
	options: { attach?: boolean; silent?: boolean } = { attach: true },
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
	const exists = tmuxSessionExists(sessionName);

	if (exists) {
		// Session exists - attach if requested
		if (options.attach) {
			if (!options.silent) {
				console.log(`\nSession "${sessionName}" exists. Attaching...\n`);
			}
			return attachToAgent(agent, options.silent);
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

		// Wait longer and verify the session is still alive (increased from 200ms to 500ms)
		await new Promise((resolve) => setTimeout(resolve, 500));
		const stillExists = tmuxSessionExists(sessionName);

		if (!stillExists) {
			return {
				success: false,
				error: `Session "${sessionName}" was created but exited immediately.\nThe launch command may be invalid or missing: ${command}\n\nPlease verify:\n  1. The command is installed and on PATH\n  2. The command doesn't exit immediately\n  3. Check 'which ${command.split(" ")[0]}' to verify the binary exists`,
			};
		}

		if (options.attach) {
			// Double-check session still exists before attaching
			const existsBeforeAttach = tmuxSessionExists(sessionName);
			if (!existsBeforeAttach) {
				return {
					success: false,
					error: `Session "${sessionName}" died before attach. The command may exit immediately: ${command}`,
				};
			}

			// Created successfully and still alive, now attach
			if (!options.silent) {
				console.log(`\nSession "${sessionName}" created. Attaching...\n`);
			}
			return attachToAgent(agent, options.silent);
		}

		// Created but not attaching - just return success
		if (!options.silent) {
			console.log(`\n✓ Agent session created: ${sessionName}\n`);
		}
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
 * If session doesn't exist, attempts to create it first
 */
export async function attachToAgent(
	agent: Agent,
	silent = false,
): Promise<LaunchResult> {
	const sessionName = agent.sessionName || `agent-${agent.id.slice(0, 6)}`;

	// Check if session exists
	const exists = tmuxSessionExists(sessionName);
	if (!exists) {
		// Session missing - try to recreate it by calling launchAgent
		if (!silent) {
			console.log(
				`\nSession "${sessionName}" not found. Creating new session...\n`,
			);
		}
		return launchAgent(agent, { attach: true, silent });
	}

	if (!silent) {
		console.log(
			`\n╔════════════════════════════════════════════════════════════════╗`,
		);
		console.log(`║  Attaching to session: ${sessionName.padEnd(38)} ║`);
		console.log(`║                                                                ║`);
		console.log(
			`║  Press Ctrl-b then d to detach and keep agent running         ║`,
		);
		console.log(
			`╚════════════════════════════════════════════════════════════════╝\n`,
		);
	}

	return new Promise((resolve) => {
		try {
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

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
 * Kill a tmux session if it exists
 */
function killTmuxSession(sessionName: string): void {
	try {
		execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`, {
			stdio: "ignore",
		});
	} catch {
		// Ignore errors - session might not exist
	}
}

/**
 * Check if a tmux session has at least one live pane (not dead)
 * Dead panes indicate the command exited
 */
function tmuxSessionHasLivePane(sessionName: string): boolean {
	try {
		const output = execSync(
			`tmux list-panes -t "${sessionName}" -F "#{pane_dead}" 2>/dev/null`,
			{ encoding: "utf-8" },
		);
		// Check if any pane has pane_dead=0 (alive)
		return output
			.trim()
			.split("\n")
			.some((value) => value === "0");
	} catch {
		return false;
	}
}

/**
 * Check if a command/binary exists on PATH
 */
function commandExists(binary: string): boolean {
	try {
		execSync(`command -v ${binary}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Create a tmux session with retry logic
 * Attempts to create session, waits for readiness, and retries once if it fails
 */
async function createSessionWithRetry(
	agent: Agent,
	sessionName: string,
	command: string,
	options: { attach?: boolean; silent?: boolean; retryCount?: number },
	attempt = 1,
): Promise<LaunchResult> {
	const maxAttempts = 2;

	try {
		// Create the session with 10s timeout
		await execAsync(`tmux new-session -d -s "${sessionName}" "${command}"`, {
			timeout: 10000,
		});

		// Increased wait time for better readiness check (from 500ms to 1000ms)
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify session still exists and has a live pane (not dead)
		const stillExists = tmuxSessionExists(sessionName);
		const hasLivePane = stillExists ? tmuxSessionHasLivePane(sessionName) : false;

		if (!stillExists || !hasLivePane) {
			// Session died or has no live pane - kill any remnants
			killTmuxSession(sessionName);

			// Retry once if this was the first attempt
			if (attempt < maxAttempts) {
				if (!options.silent) {
					console.log(
						`\nSession creation failed (attempt ${attempt}/${maxAttempts}). Retrying...\n`,
					);
				}
				// Wait before retry
				await new Promise((resolve) => setTimeout(resolve, 500));
				return createSessionWithRetry(
					agent,
					sessionName,
					command,
					options,
					attempt + 1,
				);
			}

			return {
				success: false,
				error: `Session "${sessionName}" exited immediately after ${maxAttempts} attempts.\nThe launch command may be invalid or exiting immediately: ${command}\n\nPlease verify:\n  1. Run '${command.split(" ")[0]}' directly to test if it stays alive\n  2. Check 'which ${command.split(" ")[0]}' to verify the binary exists\n  3. Ensure the command doesn't require interactive input`,
			};
		}

		if (options.attach) {
			// Final check before attach
			const existsBeforeAttach = tmuxSessionExists(sessionName);
			if (!existsBeforeAttach) {
				killTmuxSession(sessionName);
				return {
					success: false,
					error: `Session "${sessionName}" died before attach. The command may exit immediately: ${command}`,
				};
			}

			// Created successfully and still alive, now attach
			if (!options.silent) {
				console.log(`\nSession "${sessionName}" created. Attaching...\n`);
			}
			const result = await attachToAgent(agent, options.silent, options.retryCount || 0);

			// If attach failed, kill the session
			if (!result.success) {
				killTmuxSession(sessionName);
			}

			return result;
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
		// Kill any partial session on error
		killTmuxSession(sessionName);

		// Retry once if this was the first attempt
		if (attempt < maxAttempts) {
			if (!options.silent) {
				console.log(
					`\nSession creation error (attempt ${attempt}/${maxAttempts}). Retrying...\n`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
			return createSessionWithRetry(
				agent,
				sessionName,
				command,
				options,
				attempt + 1,
			);
		}

		return {
			success: false,
			error:
				error instanceof Error
					? `Failed to create tmux session after ${maxAttempts} attempts: ${error.message}`
					: "Unknown error creating tmux session",
		};
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
	options: { attach?: boolean; silent?: boolean; retryCount?: number } = { attach: true },
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

	// Preflight check: verify the launch command binary exists on PATH
	// Skip for complex commands (wrappers, env vars, quotes) to avoid false negatives
	// The live pane check after creation will catch actual failures
	const isComplexCommand =
		command.includes("=") ||      // env var assignments (FOO=bar cmd)
		command.includes("'") ||      // single quotes (bash -c 'cmd')
		command.includes('"') ||      // double quotes (bash -c "cmd")
		command.split(" ").length > 2; // multiple args (likely a wrapper)

	if (!isComplexCommand) {
		const binary = command.split(" ")[0];
		if (binary && !commandExists(binary)) {
			return {
				success: false,
				error: `Command not found: ${binary}\n\nThe agent launch command is not available on your PATH.\nTo fix this:\n  1. Install the command: which ${binary}\n  2. Or set a custom command: export SUPERSET_AGENT_LAUNCH_${agent.agentType.toUpperCase()}=your-command`,
			};
		}
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
			return attachToAgent(agent, options.silent, options.retryCount || 0);
		}
		// Session exists but not attaching - just return success
		return {
			success: true,
			exitCode: 0,
		};
	}

	// Session doesn't exist - create it in detached mode with retry
	return createSessionWithRetry(agent, sessionName, command, options);
}

/**
 * Attach to an existing agent's tmux session
 * Inherits stdio so user can interact, returns when user detaches
 * If session doesn't exist, attempts to create it first
 * @param retryCount Internal counter to prevent infinite recursion (max 1 retry)
 */
export async function attachToAgent(
	agent: Agent,
	silent = false,
	retryCount = 0,
): Promise<LaunchResult> {
	const sessionName = agent.sessionName || `agent-${agent.id.slice(0, 6)}`;

	// Check if session exists
	const exists = tmuxSessionExists(sessionName);
	if (!exists) {
		// Session missing - try to recreate it by calling launchAgent (if not already retried)
		if (retryCount >= 1) {
			return {
				success: false,
				error: `Session "${sessionName}" not found and recreate attempt already failed.`,
			};
		}
		if (!silent) {
			console.log(
				`\nSession "${sessionName}" not found. Creating new session...\n`,
			);
		}
		return launchAgent(agent, { attach: true, silent, retryCount: retryCount + 1 });
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
				// Kill session on attach error
				killTmuxSession(sessionName);
				resolve({
					success: false,
					error: `Failed to attach to session: ${error.message}`,
				});
			});

			child.on("exit", async (code) => {
				// Exit code 0 means user detached successfully
				if (code === 0 || code === null) {
					resolve({
						success: true,
						exitCode: code || 0,
					});
					return;
				}

				// Non-zero exit code indicates failure - kill the session
				killTmuxSession(sessionName);

				// One-time recovery: recreate the session and attach (if not already retried)
				// This handles cases where the pane died between session creation and attach
				if (retryCount >= 1) {
					resolve({
						success: false,
						exitCode: code,
						error: `Attach process exited with code ${code} after retry. The launch command may be invalid or exiting immediately.`,
					});
					return;
				}

				if (!silent) {
					console.log(
						`\nSession pane died. Attempting to recreate session...\n`,
					);
				}
				const retry = await launchAgent(agent, { attach: true, silent, retryCount: retryCount + 1 });
				resolve(retry);
			});
		} catch (error) {
			// Kill session on catch error
			killTmuxSession(sessionName);
			resolve({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	});
}

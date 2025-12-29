import { exec as execCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { getShellArgs } from "../../agent-setup";
import { SUPERSET_HOME_DIR } from "../../app-environment";
import { spawnWithBoundedOutput } from "./spawn-bounded";
import type {
	CreatePersistentSessionParams,
	PersistenceBackend,
	PersistenceErrorCode,
} from "./types";

const exec = promisify(execCallback);

// GUI apps on macOS don't inherit shell PATH - add common Homebrew locations
const EXTENDED_PATH = [
	"/opt/homebrew/bin",
	"/usr/local/bin",
	process.env.PATH,
].join(":");

// Exec options with extended PATH for all tmux commands
const execOpts = {
	env: (() => {
		const env = { ...process.env, PATH: EXTENDED_PATH } as NodeJS.ProcessEnv;
		delete env.TMUX;
		return env;
	})(),
};

const TMUX_SOCKET = join(SUPERSET_HOME_DIR, "tmux.sock");
const TMUX_CONFIG = join(SUPERSET_HOME_DIR, "tmux.conf");
const SESSIONS_DIR = join(SUPERSET_HOME_DIR, "tmux-sessions");

// Environment variables that are safe to pass to tmux session wrapper scripts.
// Be careful adding new keys - they're written to disk in wrapper scripts.
// Missing keys here can cause subtle bugs (e.g., SSH agent not working, GPG signing failing)
const SAFE_ENV_KEYS = [
	// Superset-specific
	"SUPERSET_PANE_ID",
	"SUPERSET_WORKSPACE_ID",
	"SUPERSET_WORKSPACE_NAME",
	"SUPERSET_WORKSPACE_PATH",
	"SUPERSET_ROOT_PATH",
	"SUPERSET_TAB_ID",
	// Shell configuration
	"ZDOTDIR",
	"SUPERSET_ORIG_ZDOTDIR",
	"SHELL",
	"HOME",
	"USER",
	"LOGNAME",
	// Terminal
	"TERM",
	"COLORTERM",
	// Locale
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	// SSH/GPG - critical for developers
	"SSH_AUTH_SOCK",
	"SSH_AGENT_PID",
	"GPG_TTY",
	"GPG_AGENT_INFO",
	// XDG directories - modern Linux/macOS standard
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
	"XDG_CACHE_HOME",
	"XDG_RUNTIME_DIR",
];

function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`;
}

function buildSafeEnvForScript(
	fullEnv: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		SAFE_ENV_KEYS.filter((k) => fullEnv[k]).map((k) => [k, fullEnv[k]]),
	);
}

export function getSessionName(workspaceId: string, paneId: string): string {
	const wsHash = crypto
		.createHash("md5")
		.update(workspaceId)
		.digest("hex")
		.slice(0, 8);
	const paneHash = crypto
		.createHash("md5")
		.update(paneId)
		.digest("hex")
		.slice(0, 8);
	return `superset-w${wsHash}-p${paneHash}`;
}

export function getWorkspacePrefix(workspaceId: string): string {
	const wsHash = crypto
		.createHash("md5")
		.update(workspaceId)
		.digest("hex")
		.slice(0, 8);
	return `superset-w${wsHash}-`;
}

export class TmuxBackend implements PersistenceBackend {
	name = "tmux" as const;

	async isAvailable(): Promise<boolean> {
		try {
			await exec("which tmux", execOpts);
			return true;
		} catch {
			return false;
		}
	}

	private async isServerRunning(): Promise<boolean> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} list-sessions 2>/dev/null`,
				execOpts,
			);
			return true;
		} catch {
			return false;
		}
	}

	async ensureServerConfig(): Promise<void> {
		const serverRunning = await this.isServerRunning();
		if (!serverRunning) {
			return;
		}

		// Critical options that must be set for proper Superset integration
		// - prefix None: no tmux key prefix conflicts
		// - status off: hide tmux status bar
		// - mouse off: CRITICAL - prevents scroll wheel from being sent to shell
		// - escape-time 0: instant ESC key response (important for vim/emacs users)
		const criticalOptions = [
			"set-option -g prefix None",
			"set-option -g status off",
			"set-option -g mouse off",
			"set-option -g escape-time 0",
		];

		for (const opt of criticalOptions) {
			try {
				await exec(`tmux -S ${shellQuote(TMUX_SOCKET)} ${opt}`, execOpts);
			} catch (error) {
				console.debug(
					`[TmuxBackend] Could not set option (may be fine): ${opt}`,
					error,
				);
			}
		}
	}

	async sessionExists(sessionName: string): Promise<boolean> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} has-session -t ${shellQuote(sessionName)} 2>/dev/null`,
				execOpts,
			);
			return true;
		} catch {
			return false;
		}
	}

	async listSessions(prefix: string): Promise<string[]> {
		try {
			const { stdout } = await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} list-sessions -F '#{session_name}' 2>/dev/null`,
				execOpts,
			);
			return stdout
				.trim()
				.split("\n")
				.filter((name) => name.startsWith(prefix));
		} catch {
			return [];
		}
	}

	async createSession(opts: CreatePersistentSessionParams): Promise<void> {
		const { name, cwd, shell, env } = opts;

		await fs.mkdir(SESSIONS_DIR, { recursive: true, mode: 0o700 });
		await fs.chmod(SESSIONS_DIR, 0o700).catch(() => {});

		const safeEnv = buildSafeEnvForScript(env);
		const shellArgs = getShellArgs(shell);

		const wrapperScript = `#!/bin/sh
${Object.entries(safeEnv)
	.map(([k, v]) => `export ${k}=${shellQuote(v)}`)
	.join("\n")}
exec ${shellQuote(shell)} ${shellArgs.map(shellQuote).join(" ")}
`;

		const scriptPath = join(SESSIONS_DIR, `${name}.sh`);
		await fs.writeFile(scriptPath, wrapperScript, { mode: 0o700 });
		await fs.chmod(scriptPath, 0o700).catch(() => {});

		await exec(
			`tmux -S ${shellQuote(TMUX_SOCKET)} -f ${shellQuote(TMUX_CONFIG)} new-session -d -s ${shellQuote(name)} -c ${shellQuote(cwd)} ${shellQuote(scriptPath)}`,
			execOpts,
		);

		// Ensure mouse is disabled for this session (critical for proper scroll behavior)
		await exec(
			`tmux -S ${shellQuote(TMUX_SOCKET)} set-option -t ${shellQuote(name)} mouse off`,
			execOpts,
		).catch(() => {
			// Non-fatal - server-wide setting should already be off
		});
	}

	/**
	 * Resize the tmux window before attaching. This ensures tmux sends
	 * correctly-sized content from the start, preventing garbled display.
	 */
	async resizeWindow(name: string, cols: number, rows: number): Promise<void> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} resize-window -t ${shellQuote(name)} -x ${cols} -y ${rows}`,
				execOpts,
			);
		} catch {
			// Non-fatal - window might not exist yet or tmux version doesn't support this
		}
	}

	async attachSession(name: string, cols = 80, rows = 24): Promise<pty.IPty> {
		const env = { ...process.env, PATH: EXTENDED_PATH } as Record<
			string,
			string
		>;
		delete env.TMUX;

		await this.detachSession(name).catch(() => {});

		// Resize tmux window BEFORE attaching to prevent garbled content
		await this.resizeWindow(name, cols, rows);

		return pty.spawn(
			"tmux",
			["-S", TMUX_SOCKET, "attach-session", "-d", "-t", name],
			{
				name: "xterm-256color",
				cols,
				rows,
				env: env as Record<string, string>,
			},
		);
	}

	/**
	 * Force tmux to redraw the client. Useful after attach when terminal size may have changed.
	 * Uses refresh-client -S which forces a complete screen redraw.
	 */
	async refreshClient(name: string): Promise<void> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} refresh-client -S -t ${shellQuote(name)}`,
				execOpts,
			);
		} catch {
			// Non-fatal - client will eventually sync
		}
	}

	classifyError(error: unknown): PersistenceErrorCode {
		const msg =
			error instanceof Error ? error.message.toLowerCase() : String(error);
		if (msg.includes("no server") || msg.includes("connection refused")) {
			return "NO_SERVER";
		}
		if (msg.includes("no such session") || msg.includes("can't find session")) {
			return "NO_SESSION";
		}
		if (msg.includes("no such file") && msg.includes("sock")) {
			return "SOCKET_MISSING";
		}
		if (msg.includes("not found") && msg.includes("tmux")) {
			return "BACKEND_NOT_FOUND";
		}
		return "ATTACH_FAILED";
	}

	async detachSession(name: string): Promise<void> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} detach-client -s ${shellQuote(name)} 2>/dev/null`,
				execOpts,
			);
		} catch {
			// Session may not have attached clients
		}
	}

	async killSession(name: string): Promise<void> {
		const scriptPath = join(SESSIONS_DIR, `${name}.sh`);
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} kill-session -t ${shellQuote(name)}`,
				execOpts,
			);
		} finally {
			try {
				await fs.rm(scriptPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
					console.warn(
						`[TmuxBackend] Failed to clean wrapper script ${scriptPath}:`,
						error,
					);
				}
			}
		}
	}

	async captureScrollback(name: string): Promise<string> {
		try {
			const result = await spawnWithBoundedOutput({
				command: "tmux",
				args: [
					"-S",
					TMUX_SOCKET,
					"capture-pane",
					"-t",
					name,
					"-p",
					"-e",
					"-S",
					"-50000",
				],
				env: execOpts.env,
				timeoutMs: 2000,
				maxStdoutBytes: 4 * 1024 * 1024, // 4MB tail
				maxStderrBytes: 64 * 1024,
			});

			if (result.exitCode !== 0) {
				// If we timed out but captured something, return the partial tail
				// rather than dropping scrollback entirely.
				if (result.timedOut && result.stdout) {
					return result.stdout;
				}
				return "";
			}

			return result.stdout;
		} catch {
			return "";
		}
	}

	async getSessionLastActivity(name: string): Promise<number | null> {
		try {
			const { stdout } = await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} display-message -p -t ${shellQuote(name)} '#{session_activity}'`,
				execOpts,
			);
			const timestamp = parseInt(stdout.trim(), 10);
			return Number.isNaN(timestamp) ? null : timestamp * 1000;
		} catch {
			return null;
		}
	}

	async cleanupOrphanedScripts(): Promise<void> {
		try {
			const scripts = await fs.readdir(SESSIONS_DIR);
			const activeSessions = await this.listSessions("superset-");
			for (const script of scripts) {
				const sessionName = script.replace(".sh", "");
				if (!activeSessions.includes(sessionName)) {
					await fs.rm(join(SESSIONS_DIR, script)).catch(() => {});
				}
			}
		} catch {
			// Directory may not exist yet
		}
	}

	async killByWorkspace(workspaceId: string): Promise<void> {
		const prefix = getWorkspacePrefix(workspaceId);
		const sessions = await this.listSessions(prefix);
		for (const session of sessions) {
			await this.killSession(session).catch(() => {});
		}
	}
}

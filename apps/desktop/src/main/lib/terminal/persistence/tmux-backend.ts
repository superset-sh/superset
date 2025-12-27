import { exec as execCallback } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import * as pty from "node-pty";
import { getShellArgs } from "../../agent-setup";
import { SUPERSET_HOME_DIR } from "../../app-environment";
import type {
	CreatePersistentSessionParams,
	PersistenceBackend,
} from "./types";

const exec = promisify(execCallback);

const TMUX_SOCKET = join(SUPERSET_HOME_DIR, "tmux.sock");
const TMUX_CONFIG = join(SUPERSET_HOME_DIR, "tmux.conf");
const SESSIONS_DIR = join(SUPERSET_HOME_DIR, "tmux-sessions");

const SAFE_ENV_KEYS = [
	"SUPERSET_PANE_ID",
	"SUPERSET_WORKSPACE_ID",
	"SUPERSET_WORKSPACE_NAME",
	"SUPERSET_WORKSPACE_PATH",
	"SUPERSET_ROOT_PATH",
	"SUPERSET_TAB_ID",
	"ZDOTDIR",
	"SUPERSET_ORIG_ZDOTDIR",
	"TERM",
	"COLORTERM",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"SHELL",
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
			await exec("which tmux");
			return true;
		} catch {
			return false;
		}
	}

	private async isServerRunning(): Promise<boolean> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} list-sessions 2>/dev/null`,
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

		const criticalOptions = [
			"set-option -g prefix None",
			"set-option -g status off",
		];

		for (const opt of criticalOptions) {
			try {
				await exec(`tmux -S ${shellQuote(TMUX_SOCKET)} ${opt}`);
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

		await fs.mkdir(SESSIONS_DIR, { recursive: true });

		const safeEnv = buildSafeEnvForScript(env);
		const shellArgs = getShellArgs(shell);

		const wrapperScript = `#!/bin/sh
${Object.entries(safeEnv)
	.map(([k, v]) => `export ${k}=${shellQuote(v)}`)
	.join("\n")}
exec ${shellQuote(shell)} ${shellArgs.map(shellQuote).join(" ")}
`;

		const scriptPath = join(SESSIONS_DIR, `${name}.sh`);
		await fs.writeFile(scriptPath, wrapperScript, { mode: 0o755 });

		await exec(
			`tmux -S ${shellQuote(TMUX_SOCKET)} -f ${shellQuote(TMUX_CONFIG)} new-session -d -s ${shellQuote(name)} -c ${shellQuote(cwd)} ${shellQuote(scriptPath)}`,
		);
	}

	async attachSession(name: string): Promise<pty.IPty> {
		const env = { ...process.env };
		delete env.TMUX;

		return pty.spawn(
			"tmux",
			["-S", TMUX_SOCKET, "attach-session", "-t", name],
			{
				name: "xterm-256color",
				cols: 80,
				rows: 24,
				env: env as Record<string, string>,
			},
		);
	}

	async detachSession(name: string): Promise<void> {
		try {
			await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} detach-client -s ${shellQuote(name)} 2>/dev/null`,
			);
		} catch {
			// Session may not have attached clients
		}
	}

	async killSession(name: string): Promise<void> {
		await exec(
			`tmux -S ${shellQuote(TMUX_SOCKET)} kill-session -t ${shellQuote(name)}`,
		);

		const scriptPath = join(SESSIONS_DIR, `${name}.sh`);
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

	async captureScrollback(name: string): Promise<string> {
		try {
			const { stdout } = await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} capture-pane -t ${shellQuote(name)} -p -e -S -50000`,
			);
			return stdout;
		} catch {
			return "";
		}
	}

	async getSessionLastActivity(name: string): Promise<number | null> {
		try {
			const { stdout } = await exec(
				`tmux -S ${shellQuote(TMUX_SOCKET)} display-message -p -t ${shellQuote(name)} '#{session_activity}'`,
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

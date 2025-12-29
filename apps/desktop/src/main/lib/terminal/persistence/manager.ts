import fs from "node:fs/promises";
import { join } from "node:path";
import type * as pty from "node-pty";
import { SUPERSET_HOME_DIR } from "../../app-environment";
import {
	SessionLifecycle,
	type SessionLifecycleEvents,
} from "./session-lifecycle";
import {
	getSessionName,
	getWorkspacePrefix,
	TmuxBackend,
} from "./tmux-backend";
import type { CreatePersistentSessionParams } from "./types";

const MAX_ORPHAN_AGE_MS = 72 * 60 * 60 * 1000;

class ProcessPersistence {
	private backend: TmuxBackend | null = null;
	private _enabled = false;
	private backendInitPromise: Promise<TmuxBackend | null> | null = null;
	private setEnabledPromise: Promise<void> | null = null;

	get enabled(): boolean {
		return this._enabled;
	}

	private async ensureBackend(): Promise<TmuxBackend | null> {
		const supported = process.platform !== "win32";
		if (!supported) {
			this.backend = null;
			return null;
		}

		if (this.backend) {
			return this.backend;
		}

		if (this.backendInitPromise) {
			return this.backendInitPromise;
		}

		this.backendInitPromise = (async () => {
			const tmux = new TmuxBackend();
			const tmuxAvailable = await tmux.isAvailable();
			if (!tmuxAvailable) {
				return null;
			}
			this.backend = tmux;
			return tmux;
		})().finally(() => {
			this.backendInitPromise = null;
		});

		return this.backendInitPromise;
	}

	async getStatus(): Promise<{
		supported: boolean;
		tmuxAvailable: boolean;
		enabled: boolean;
	}> {
		const supported = process.platform !== "win32";
		if (!supported) {
			return { supported, tmuxAvailable: false, enabled: false };
		}

		const backend = await this.ensureBackend();
		const tmuxAvailable = backend ? await backend.isAvailable() : false;
		return {
			supported,
			tmuxAvailable,
			enabled: this._enabled && tmuxAvailable,
		};
	}

	async setEnabled(enabled: boolean): Promise<void> {
		if (enabled === this._enabled) return;

		if (this.setEnabledPromise) {
			await this.setEnabledPromise;
			if (enabled === this._enabled) return;
		}

		this.setEnabledPromise = this.doSetEnabled(enabled);
		try {
			await this.setEnabledPromise;
		} finally {
			this.setEnabledPromise = null;
		}
	}

	private async doSetEnabled(enabled: boolean): Promise<void> {
		if (!enabled) {
			this._enabled = false;
			return;
		}

		if (process.platform === "win32") {
			this._enabled = false;
			throw new Error(
				"Terminal session persistence is not supported on Windows.",
			);
		}

		const backend = await this.ensureBackend();
		if (!backend) {
			throw new Error("tmux is not available. Install tmux to enable this.");
		}

		await this.copyTmuxConfig();
		await backend.ensureServerConfig();
		await backend.cleanupOrphanedScripts?.();
		this._enabled = true;
	}

	private async copyTmuxConfig(): Promise<void> {
		const configPath = join(SUPERSET_HOME_DIR, "tmux.conf");
		// IMPORTANT: mouse off is CRITICAL for proper scroll behavior
		// Without it, scroll wheel events are sent to the shell and interpreted
		// as up/down arrows (cycling through command history)
		// Always overwrite to ensure correct settings (don't skip if file exists)
		// The terminal-overrides with kmous@ disables mouse capability at terminfo level
		const defaultConfig = `# Superset tmux config - minimal, non-conflicting
# DO NOT EDIT - this file is managed by Superset and will be overwritten
set -g prefix None
unbind C-b
set -g mouse on
set -g status off
set -g history-limit 50000
set -g escape-time 0
set -g default-terminal "xterm-256color"
set -ga terminal-overrides ",xterm-256color:Tc"
`;
		await fs.writeFile(configPath, defaultConfig, { mode: 0o600 });
		await fs.chmod(configPath, 0o600).catch(() => {});
	}

	async sessionExists(sessionName: string): Promise<boolean> {
		const backend = await this.ensureBackend();
		if (!backend) return false;
		return backend.sessionExists(sessionName);
	}

	async listSessions(prefix: string): Promise<string[]> {
		const backend = await this.ensureBackend();
		if (!backend) return [];
		return backend.listSessions(prefix);
	}

	async createSession(opts: CreatePersistentSessionParams): Promise<void> {
		if (!this._enabled) {
			throw new Error("Terminal session persistence is not enabled");
		}
		const backend = await this.ensureBackend();
		if (!backend) {
			throw new Error("tmux is not available. Install tmux to enable this.");
		}
		return backend.createSession(opts);
	}

	async attachSession(
		name: string,
		cols?: number,
		rows?: number,
	): Promise<pty.IPty> {
		const backend = await this.ensureBackend();
		if (!backend) {
			throw new Error("No persistence backend available");
		}
		return backend.attachSession(name, cols, rows);
	}

	async detachSession(name: string): Promise<void> {
		const backend = await this.ensureBackend();
		if (!backend) return;
		return backend.detachSession(name);
	}

	async killSession(name: string): Promise<void> {
		const backend = await this.ensureBackend();
		if (!backend) return;
		return backend.killSession(name);
	}

	async captureScrollback(name: string): Promise<string> {
		const backend = await this.ensureBackend();
		if (!backend) return "";
		return backend.captureScrollback(name);
	}

	async killByWorkspace(workspaceId: string): Promise<void> {
		const backend = await this.ensureBackend();
		if (!backend) return;
		const prefix = getWorkspacePrefix(workspaceId);
		const sessions = await backend.listSessions(prefix);
		for (const session of sessions) {
			await backend.killSession(session).catch(() => {});
		}
	}

	async cleanupOrphanedSessions(
		getKnownPaneIds: () => Promise<Array<{ wsId: string; id: string }>>,
	): Promise<void> {
		const backend = await this.ensureBackend();
		if (!backend) return;

		try {
			const backendSessions = await backend.listSessions("superset-");
			const knownPanes = await getKnownPaneIds();

			for (const session of backendSessions) {
				const isKnown = knownPanes.some(
					(p) => getSessionName(p.wsId, p.id) === session,
				);
				if (isKnown) continue;

				if (backend.getSessionLastActivity) {
					const lastActivity = await backend.getSessionLastActivity(session);
					if (lastActivity === null) {
						console.log(
							`[ProcessPersistence] Keeping orphan (unknown age): ${session}`,
						);
						continue;
					}
					const age = Date.now() - lastActivity;

					if (age > MAX_ORPHAN_AGE_MS) {
						console.log(
							`[ProcessPersistence] Cleaning stale orphan: ${session}`,
						);
						await backend.killSession(session).catch(() => {});
					}
				}
			}
		} catch (error) {
			console.warn("[ProcessPersistence] Orphan cleanup failed:", error);
		}
	}

	async cleanupAllSupersetSessions(): Promise<void> {
		const backend = await this.ensureBackend();
		if (!backend) return;

		try {
			const sessions = await backend.listSessions("superset-");
			for (const session of sessions) {
				await backend.killSession(session).catch(() => {});
			}
			await backend.cleanupOrphanedScripts?.();
		} catch (error) {
			console.warn(
				"[ProcessPersistence] Failed to cleanup Superset sessions:",
				error,
			);
		}
	}

	/**
	 * Create a SessionLifecycle for managing a persistent terminal session.
	 * This is the only way TerminalManager should interact with the persistence backend.
	 */
	createLifecycle(
		sessionName: string,
		events: SessionLifecycleEvents,
	): SessionLifecycle {
		if (!this.backend) {
			throw new Error("No persistence backend available");
		}
		return new SessionLifecycle(sessionName, this.backend, events);
	}
}

export const processPersistence = new ProcessPersistence();
export { getSessionName, getWorkspacePrefix };

import { EventEmitter } from "node:events";
import type { IPty } from "node-pty";
import type { SshConnectionManager } from "./connection-manager";
import type { ZmxSessionManager } from "./zmx-manager";
import type {
	TerminalCapabilities,
	TerminalEventSource,
	TerminalManagement,
	TerminalSessionOperations,
	TerminalWorkspaceOperations,
} from "../workspace-runtime/types";
import type { CreateSessionParams, SessionResult } from "../terminal/types";

const OUTPUT_BUFFER_MAX = 200_000;
const OUTPUT_BUFFER_TRIM = 100_000;

interface SshSessionInfo {
	paneId: string;
	workspaceId: string;
	pty: IPty;
	isAlive: boolean;
	detached: boolean;
	cwd: string;
	lastActive: number;
	outputBuffer: string;
}

export class SshTerminalManager
	extends EventEmitter
	implements
		TerminalEventSource,
		TerminalSessionOperations,
		TerminalWorkspaceOperations
{
	private readonly sessions = new Map<string, SshSessionInfo>();
	private readonly pendingAttaches = new Map<string, Promise<SessionResult>>();

	readonly capabilities: TerminalCapabilities = {
		persistent: true,
		coldRestore: false,
	};

	readonly management: TerminalManagement = {
		listSessions: async () => ({ sessions: [] }),
		killAllSessions: async () => {},
		resetHistoryPersistence: async () => {},
	};

	constructor(
		private readonly connectionManager: SshConnectionManager,
		private readonly zmxManager: ZmxSessionManager,
	) {
		super();
	}

	async createOrAttach(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;
		const pendingAttach = this.pendingAttaches.get(paneId);
		if (pendingAttach) {
			return pendingAttach;
		}

		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			existing.detached = false;
			return this.reattach(existing, params);
		}

		const promise = this.createNew(params);
		this.pendingAttaches.set(paneId, promise);

		try {
			return await promise;
		} finally {
			if (this.pendingAttaches.get(paneId) === promise) {
				this.pendingAttaches.delete(paneId);
			}
		}
	}

	private reattach(
		session: SshSessionInfo,
		params: CreateSessionParams,
	): Promise<SessionResult> {
		session.detached = false;
		const scrollback = session.outputBuffer;

		return Promise.resolve({
			isNew: false,
			scrollback,
			wasRecovered: true,
			isColdRestore: false,
			snapshot: {
				snapshotAnsi: scrollback,
				rehydrateSequences: "",
				cwd: session.cwd,
				modes: {},
				cols: params.cols ?? 80,
				rows: params.rows ?? 24,
				scrollbackLines: scrollback === "" ? 0 : scrollback.split("\n").length,
			},
			pid: session.pty.pid,
		} as SessionResult & { pid: number });
	}

	private async createNew(params: CreateSessionParams): Promise<SessionResult> {
		const { paneId } = params;
		const cwd = params.cwd ?? params.workspacePath ?? "/";
		const cols = params.cols ?? 80;
		const rows = params.rows ?? 24;

		await this.connectionManager.ensureAlive();

		const sessionExisted = await this.zmxManager.hasSession(paneId);
		const sessionName = this.zmxManager.sanitizeSessionName(paneId);

		const ptyProc = this.connectionManager.spawnPty(
			`cd ${this.shellEscape(cwd)} && ~/.local/bin/zmx attach ${this.shellEscape(sessionName)}`,
			{ cols, rows },
		);

		const session: SshSessionInfo = {
			paneId,
			workspaceId: params.workspaceId,
			pty: ptyProc,
			isAlive: true,
			detached: false,
			cwd,
			lastActive: Date.now(),
			outputBuffer: "",
		};

		ptyProc.onData((data) => {
			session.lastActive = Date.now();
			session.outputBuffer += data;
			if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
				session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_TRIM);
			}
			if (!session.detached) {
				this.emit(`data:${paneId}`, data);
			}
		});
		ptyProc.onExit(({ exitCode, signal }) => {
			this.handleExit(paneId, exitCode, signal);
		});

		this.sessions.set(paneId, session);

		return {
			isNew: !sessionExisted,
			scrollback: "",
			wasRecovered: sessionExisted,
			isColdRestore: false,
			snapshot: {
				snapshotAnsi: "",
				rehydrateSequences: "",
				cwd,
				modes: {},
				cols,
				rows,
				scrollbackLines: 0,
			},
			pid: ptyProc.pid,
		} as SessionResult & { pid: number };
	}

	write(params: { paneId: string; data: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.isAlive) {
			return;
		}
		session.lastActive = Date.now();
		session.pty.write(params.data);
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.isAlive) {
			return;
		}
		try {
			session.pty.resize(params.cols, params.rows);
		} catch {}
	}

	signal(params: { paneId: string; signal?: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session?.isAlive) {
			return;
		}
		session.lastActive = Date.now();
		session.pty.kill(params.signal);
	}

	async kill(params: { paneId: string }): Promise<void> {
		const session = this.sessions.get(params.paneId);
		if (!session) {
			return;
		}
		session.isAlive = false;
		session.pty.kill();
		await this.zmxManager.killSession(params.paneId).catch(() => {});
		this.emit(`exit:${params.paneId}`, 0, undefined, "killed");
		this.sessions.delete(params.paneId);
	}

	detach(params: { paneId: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) {
			return;
		}
		session.detached = true;
	}

	clearScrollback(params: { paneId: string }): void {
		const session = this.sessions.get(params.paneId);
		if (!session) {
			return;
		}
		session.outputBuffer = "";
	}

	ackColdRestore(_paneId: string): void {}

	getSession(
		paneId: string,
	): { isAlive: boolean; cwd: string; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}
		return {
			isAlive: session.isAlive,
			cwd: session.cwd,
			lastActive: session.lastActive,
		};
	}

	cancelCreateOrAttach(_params: { paneId: string; requestId: string }): void {}

	async killByWorkspaceId(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		let killed = 0;
		for (const [paneId, session] of this.sessions.entries()) {
			if (session.workspaceId !== workspaceId) {
				continue;
			}
			session.isAlive = false;
			session.pty.kill();
			await this.zmxManager.killSession(paneId).catch(() => {});
			this.sessions.delete(paneId);
			killed += 1;
		}
		return { killed, failed: 0 };
	}

	async getSessionCountByWorkspaceId(workspaceId: string): Promise<number> {
		return Array.from(this.sessions.values()).filter(
			(session) => session.workspaceId === workspaceId,
		).length;
	}

	refreshPromptsForWorkspace(_workspaceId: string): void {}

	detachAllListeners(): void {
		this.removeAllListeners();
	}

	async cleanup(): Promise<void> {
		for (const [paneId, session] of this.sessions.entries()) {
			session.isAlive = false;
			session.pty.kill();
			await this.zmxManager.killSession(paneId).catch(() => {});
		}
		this.sessions.clear();
	}

	private handleExit(
		paneId: string,
		exitCode: number,
		signal: number | undefined,
	): void {
		const session = this.sessions.get(paneId);
		if (!session || !session.isAlive) {
			return;
		}
		session.isAlive = false;
		this.emit(`exit:${paneId}`, exitCode, signal, "exited");
		this.sessions.delete(paneId);
	}

	private shellEscape(value: string): string {
		return `'${value.replaceAll("'", `'\\''`)}'`;
	}
}

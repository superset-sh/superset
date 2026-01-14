import { EventEmitter } from "node:events";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal as HeadlessTerminal } from "@xterm/headless";
import { freestyle } from "freestyle-sandboxes";
import { DataBatcher } from "../data-batcher";
import type {
	CloudSessionResult,
	CloudTerminalSession,
	CreateCloudSessionParams,
} from "./types";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

// Polling interval for terminal output (ms)
const POLL_INTERVAL_MS = 1000;

/**
 * Creates a headless xterm terminal for capturing scrollback
 */
function createHeadlessTerminal(params: { cols: number; rows: number }) {
	const headless = new HeadlessTerminal({
		cols: params.cols,
		rows: params.rows,
		scrollback: 10000,
		allowProposedApi: true,
	});
	const serializer = new SerializeAddon();
	headless.loadAddon(serializer);
	return { headless, serializer };
}

/**
 * Get serialized scrollback from headless terminal
 */
function getSerializedScrollback(session: CloudTerminalSession): string {
	try {
		return session.serializer.serialize();
	} catch {
		return "";
	}
}

/**
 * Cloud Terminal Manager for managing remote terminal sessions via Freestyle
 *
 * NOTE: The current Freestyle SDK (v0.1.3) only provides read-only access to
 * terminal output via getOutput(). Full interactive terminal support with
 * WebSocket connections is planned for a future version.
 *
 * Current implementation:
 * - Polls terminal output from Freestyle API
 * - Displays terminal history/logs in read-only mode
 *
 * Future implementation will:
 * - Establish WebSocket connections for real-time I/O
 * - Support bidirectional terminal input/output
 */
export class CloudTerminalManager extends EventEmitter {
	private sessions = new Map<string, CloudTerminalSession>();
	private pendingSessions = new Map<string, Promise<CloudSessionResult>>();
	private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

	async createOrAttach(
		params: CreateCloudSessionParams,
	): Promise<CloudSessionResult> {
		const { paneId, cols, rows } = params;

		// Deduplicate concurrent calls
		const pending = this.pendingSessions.get(paneId);
		if (pending) {
			return pending;
		}

		// Return existing session if alive
		const existing = this.sessions.get(paneId);
		if (existing?.isAlive) {
			existing.lastActive = Date.now();
			if (cols !== undefined && rows !== undefined) {
				this.resize({ paneId, cols, rows });
			}
			return {
				isNew: false,
				scrollback: getSerializedScrollback(existing),
				wasRecovered: existing.wasRecovered,
				viewportY: existing.viewportY,
			};
		}

		// Create new session
		const creationPromise = this.doCreateSession(params);
		this.pendingSessions.set(paneId, creationPromise);

		try {
			return await creationPromise;
		} finally {
			this.pendingSessions.delete(paneId);
		}
	}

	private async doCreateSession(
		params: CreateCloudSessionParams,
	): Promise<CloudSessionResult> {
		const {
			paneId,
			cloudWorkspaceId,
			vmId,
			cols = DEFAULT_COLS,
			rows = DEFAULT_ROWS,
		} = params;

		// Create headless terminal for scrollback
		const { headless, serializer } = createHeadlessTerminal({ cols, rows });

		// Create data batcher for efficient data emission
		const dataBatcher = new DataBatcher((data) => {
			this.emit(`data:${paneId}`, data);
		});

		// Get VM reference and list existing terminals
		const vm = freestyle.vms.ref({ vmId });
		const terminalInfo = await vm.terminals.list();

		// Use the first available terminal or throw if none exists
		if (!terminalInfo.terminals || terminalInfo.terminals.length === 0) {
			throw new Error(
				`No terminals available for VM ${vmId}. The VM may not have started yet.`,
			);
		}

		const terminalName = terminalInfo.terminals[0].name;

		// Create session object
		const session: CloudTerminalSession = {
			paneId,
			cloudWorkspaceId,
			vmId,
			terminalId: terminalName,
			cols,
			rows,
			lastActive: Date.now(),
			headless,
			serializer,
			isAlive: true,
			wasRecovered: false,
			dataBatcher,
			startTime: Date.now(),
		};

		this.sessions.set(paneId, session);

		// Fetch initial terminal output
		await this.fetchTerminalOutput(session);

		// Start polling for terminal output updates
		// NOTE: This is a temporary workaround until WebSocket support is added
		const pollInterval = setInterval(() => {
			if (session.isAlive) {
				void this.fetchTerminalOutput(session);
			}
		}, POLL_INTERVAL_MS);
		this.pollIntervals.set(paneId, pollInterval);

		console.log(
			`[CloudTerminalManager] Created cloud terminal session for pane ${paneId} on VM ${vmId} (terminal: ${terminalName})`,
		);

		return {
			isNew: true,
			scrollback: getSerializedScrollback(session),
			wasRecovered: session.wasRecovered,
		};
	}

	/**
	 * Fetch terminal output from Freestyle API
	 * NOTE: This is a read-only operation - input is not supported yet
	 */
	private async fetchTerminalOutput(session: CloudTerminalSession): Promise<void> {
		try {
			const vm = freestyle.vms.ref({ vmId: session.vmId });
			const result = await vm.terminals.getOutput({
				terminalId: session.terminalId,
			});

			if (result?.output) {
				session.headless.write(result.output);
				session.dataBatcher.write(result.output);
			}
		} catch (error) {
			console.error(
				`[CloudTerminalManager] Failed to fetch terminal output:`,
				error,
			);
		}
	}

	write(params: { paneId: string; data: string }): void {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			throw new Error(
				`Cloud terminal session ${paneId} not found or not alive`,
			);
		}

		// NOTE: Terminal input is not yet supported via the Freestyle SDK
		// This would require WebSocket-based terminal access which isn't
		// currently available in the SDK
		console.warn(
			`[CloudTerminalManager] Terminal input not yet supported for cloud terminals`,
		);
		session.lastActive = Date.now();
	}

	resize(params: { paneId: string; cols: number; rows: number }): void {
		const { paneId, cols, rows } = params;

		if (
			!Number.isInteger(cols) ||
			!Number.isInteger(rows) ||
			cols <= 0 ||
			rows <= 0
		) {
			console.warn(
				`[CloudTerminalManager] Invalid resize geometry for ${paneId}: cols=${cols}, rows=${rows}`,
			);
			return;
		}

		const session = this.sessions.get(paneId);

		if (!session || !session.isAlive) {
			console.warn(
				`Cannot resize cloud terminal ${paneId}: session not found or not alive`,
			);
			return;
		}

		try {
			session.headless.resize(cols, rows);
			session.cols = cols;
			session.rows = rows;
			session.lastActive = Date.now();
			// NOTE: Remote terminal resize not yet supported via SDK
		} catch (error) {
			console.error(
				`[CloudTerminalManager] Failed to resize terminal ${paneId}:`,
				error,
			);
		}
	}

	async kill(params: { paneId: string }): Promise<void> {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot kill cloud terminal ${paneId}: session not found`,
			);
			return;
		}

		// Stop polling
		const interval = this.pollIntervals.get(paneId);
		if (interval) {
			clearInterval(interval);
			this.pollIntervals.delete(paneId);
		}

		session.isAlive = false;
		session.dataBatcher.flush();
		session.headless.dispose();
		this.sessions.delete(paneId);

		this.emit(`exit:${paneId}`, 0);
	}

	detach(params: { paneId: string; viewportY?: number }): void {
		const { paneId, viewportY } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot detach cloud terminal ${paneId}: session not found`,
			);
			return;
		}

		session.lastActive = Date.now();
		if (viewportY !== undefined) {
			session.viewportY = viewportY;
		}
	}

	clearScrollback(params: { paneId: string }): void {
		const { paneId } = params;
		const session = this.sessions.get(paneId);

		if (!session) {
			console.warn(
				`Cannot clear scrollback for cloud terminal ${paneId}: session not found`,
			);
			return;
		}

		// Recreate headless terminal
		session.headless.dispose();
		const { headless, serializer } = createHeadlessTerminal({
			cols: session.cols,
			rows: session.rows,
		});
		session.headless = headless;
		session.serializer = serializer;
		session.lastActive = Date.now();
	}

	getSession(
		paneId: string,
	): { isAlive: boolean; lastActive: number } | null {
		const session = this.sessions.get(paneId);
		if (!session) {
			return null;
		}

		return {
			isAlive: session.isAlive,
			lastActive: session.lastActive,
		};
	}

	async killByCloudWorkspaceId(
		cloudWorkspaceId: string,
	): Promise<{ killed: number; failed: number }> {
		const sessionsToKill = Array.from(this.sessions.entries()).filter(
			([, session]) => session.cloudWorkspaceId === cloudWorkspaceId,
		);

		if (sessionsToKill.length === 0) {
			return { killed: 0, failed: 0 };
		}

		let killed = 0;
		let failed = 0;

		for (const [paneId] of sessionsToKill) {
			try {
				await this.kill({ paneId });
				killed++;
			} catch {
				failed++;
			}
		}

		return { killed, failed };
	}

	detachAllListeners(): void {
		for (const event of this.eventNames()) {
			const name = String(event);
			if (name.startsWith("data:") || name.startsWith("exit:")) {
				this.removeAllListeners(event);
			}
		}
	}

	async cleanup(): Promise<void> {
		// Stop all polling intervals
		for (const interval of this.pollIntervals.values()) {
			clearInterval(interval);
		}
		this.pollIntervals.clear();

		// Kill all sessions
		const killPromises: Promise<void>[] = [];
		for (const [paneId] of this.sessions.entries()) {
			killPromises.push(this.kill({ paneId }));
		}

		await Promise.all(killPromises);
		this.sessions.clear();
		this.removeAllListeners();
	}
}

/** Singleton cloud terminal manager instance */
export const cloudTerminalManager = new CloudTerminalManager();

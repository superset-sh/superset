import type * as pty from "node-pty";
import type { SessionState, TmuxError } from "./types";
import type { TmuxBackend } from "./tmux-backend";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [100, 500, 1000];

export interface SessionLifecycleEvents {
	onStateChange: (state: SessionState, prevState: SessionState) => void;
	onData: (data: string) => void;
	onError: (error: TmuxError, message: string) => void;
}

export class SessionLifecycle {
	private state: SessionState = "disconnected";
	private ptyProcess: pty.IPty | null = null;
	private attachPromise: Promise<boolean> | null = null;
	private retryCount = 0;
	private lastDimensions = { cols: 80, rows: 24 };
	private disposed = false;

	constructor(
		private readonly sessionName: string,
		private readonly backend: TmuxBackend,
		private readonly events: SessionLifecycleEvents,
	) {}

	getState(): SessionState {
		return this.state;
	}

	getPty(): pty.IPty | null {
		return this.ptyProcess;
	}

	private transition(newState: SessionState): void {
		if (this.state === newState) return;
		const prev = this.state;
		this.state = newState;
		this.events.onStateChange(newState, prev);
	}

	async ensureAttached(cols: number, rows: number): Promise<boolean> {
		if (this.disposed) return false;

		this.lastDimensions = { cols, rows };

		if (this.attachPromise) {
			await this.attachPromise;
			return this.state === "connected";
		}

		if (this.state === "connected" && this.ptyProcess) {
			try {
				this.ptyProcess.resize(cols, rows);
			} catch {}
			return true;
		}

		this.attachPromise = this.doAttach(cols, rows);
		try {
			return await this.attachPromise;
		} finally {
			this.attachPromise = null;
		}
	}

	private async doAttach(cols: number, rows: number): Promise<boolean> {
		this.transition("connecting");

		try {
			const sessionExists = await this.backend.sessionExists(this.sessionName);
			if (!sessionExists) {
				this.transition("closed");
				return false;
			}

			this.ptyProcess = await this.backend.attachSession(
				this.sessionName,
				cols,
				rows,
			);
			this.wireHandlers(cols, rows);

			try {
				this.ptyProcess.resize(cols, rows);
			} catch {}

			this.retryCount = 0;
			this.transition("connected");
			return true;
		} catch (error) {
			const tmuxError = this.backend.classifyError(error);
			this.events.onError(
				tmuxError,
				error instanceof Error ? error.message : String(error),
			);
			this.transition("failed");
			return false;
		}
	}

	private wireHandlers(cols: number, rows: number): void {
		if (!this.ptyProcess) return;

		this.ptyProcess.onData((data) => {
			if (!this.disposed) {
				this.events.onData(data);
			}
		});

		this.ptyProcess.onExit(async () => {
			this.ptyProcess = null;

			if (this.disposed || this.state === "closed") return;

			const sessionExists = await this.backend
				.sessionExists(this.sessionName)
				.catch(() => false);

			if (!sessionExists) {
				this.transition("closed");
				return;
			}

			if (this.retryCount < MAX_RETRIES) {
				this.retryCount++;
				this.transition("reconnecting");

				const delay = RETRY_DELAYS_MS[this.retryCount - 1] ?? 1000;
				await new Promise((r) => setTimeout(r, delay));

				if (!this.disposed) {
					await this.doAttach(cols, rows);
				}
			} else {
				this.events.onError(
					"ATTACH_FAILED",
					`Max retries (${MAX_RETRIES}) exhausted`,
				);
				this.transition("failed");
			}
		});
	}

	write(data: string): void {
		if (this.state !== "connected" || !this.ptyProcess) {
			throw new Error(`Cannot write: session state is ${this.state}`);
		}
		this.ptyProcess.write(data);
	}

	resize(cols: number, rows: number): void {
		this.lastDimensions = { cols, rows };
		if (this.state === "connected" && this.ptyProcess) {
			try {
				this.ptyProcess.resize(cols, rows);
			} catch {}
		}
	}

	async detach(): Promise<void> {
		if (this.disposed) return;

		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill();
			} catch {}
			this.ptyProcess = null;
		}
		this.transition("disconnected");
	}

	async close(): Promise<void> {
		this.disposed = true;
		this.transition("closed");

		if (this.ptyProcess) {
			try {
				this.ptyProcess.kill();
			} catch {}
			this.ptyProcess = null;
		}
	}

	async retry(): Promise<boolean> {
		if (this.disposed) return false;
		if (this.state !== "failed") return this.state === "connected";

		this.retryCount = 0;
		return this.ensureAttached(
			this.lastDimensions.cols,
			this.lastDimensions.rows,
		);
	}
}

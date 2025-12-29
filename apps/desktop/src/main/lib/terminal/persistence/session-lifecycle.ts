import type * as pty from "node-pty";
import type {
	PersistenceBackend,
	PersistenceErrorCode,
	SessionState,
} from "./types";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [100, 500, 1000];
const MAX_BUFFER_BYTES = 1024 * 1024; // 1MB max buffer

/** Error codes that indicate the session provably doesn't exist - safe to proceed without preserving */
const SAFE_TO_PROCEED_CODES: Set<PersistenceErrorCode> = new Set([
	"NO_SERVER",
	"NO_SESSION",
	"SOCKET_MISSING",
]);

export interface SessionLifecycleEvents {
	onStateChange: (state: SessionState, prevState: SessionState) => void;
	onError: (error: PersistenceErrorCode, message: string) => void;
}

export class SessionLifecycle {
	private state: SessionState = "disconnected";
	private ptyProcess: pty.IPty | null = null;
	private attachPromise: Promise<boolean> | null = null;
	private retryCount = 0;
	private lastDimensions = { cols: 80, rows: 24 };
	private disposed = false;
	private isDetaching = false;
	private _wasRetrying = false;
	private _lastErrorCode: PersistenceErrorCode | null = null;

	// Data buffering until handler is set
	private dataBuffer: string[] = [];
	private dataBufferBytes = 0;
	private dataHandler: ((data: string) => void) | null = null;

	constructor(
		private readonly sessionName: string,
		private readonly backend: PersistenceBackend,
		private readonly events: SessionLifecycleEvents,
	) {}

	getState(): SessionState {
		return this.state;
	}

	getPty(): pty.IPty | null {
		return this.ptyProcess;
	}

	/** Returns true if the last failure was due to a reconnection attempt */
	get wasRetrying(): boolean {
		return this._wasRetrying;
	}

	/** Returns the last error code, if any */
	get lastErrorCode(): PersistenceErrorCode | null {
		return this._lastErrorCode;
	}

	/** Returns true if the last error indicates the session provably doesn't exist */
	isSafeToProceed(): boolean {
		return (
			this._lastErrorCode !== null &&
			SAFE_TO_PROCEED_CODES.has(this._lastErrorCode)
		);
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
		const wasInRetryState = this._wasRetrying || this.state === "reconnecting";
		this.transition("connecting");

		try {
			const sessionExists = await this.backend.sessionExists(this.sessionName);
			if (!sessionExists) {
				this._lastErrorCode = "NO_SESSION";
				this.transition("closed");
				return false;
			}

			this.ptyProcess = await this.backend.attachSession(
				this.sessionName,
				cols,
				rows,
			);
			this.wireHandlers();

			try {
				this.ptyProcess.resize(cols, rows);
			} catch {}

			// Track if this was a successful reconnection
			this._wasRetrying = wasInRetryState;
			this._lastErrorCode = null;
			this.retryCount = 0;
			this.transition("connected");
			return true;
		} catch (error) {
			const tmuxError = this.backend.classifyError(error);
			this._lastErrorCode = tmuxError;

			// If this is an initial attach (not a reconnect from onExit) and error is retryable,
			// attempt bounded retries before failing
			if (!wasInRetryState && !SAFE_TO_PROCEED_CODES.has(tmuxError)) {
				if (this.retryCount < MAX_RETRIES) {
					this.retryCount++;
					const delay = RETRY_DELAYS_MS[this.retryCount - 1] ?? 1000;
					console.log(
						`[SessionLifecycle] Initial attach failed, retry ${this.retryCount}/${MAX_RETRIES} in ${delay}ms`,
					);
					await new Promise((r) => setTimeout(r, delay));

					if (!this.disposed && !this.isDetaching) {
						return this.doAttach(cols, rows);
					}
				}
			}

			this.events.onError(
				tmuxError,
				error instanceof Error ? error.message : String(error),
			);
			this.transition("failed");
			return false;
		}
	}

	private wireHandlers(): void {
		if (!this.ptyProcess) return;

		this.ptyProcess.onData((data) => {
			if (this.disposed) return;

			if (this.dataHandler) {
				this.dataHandler(data);
			} else {
				// Buffer data until handler is set, with byte limit
				const chunkBytes = Buffer.byteLength(data, "utf8");
				if (this.dataBufferBytes + chunkBytes <= MAX_BUFFER_BYTES) {
					this.dataBuffer.push(data);
					this.dataBufferBytes += chunkBytes;
				}
				// Drop if buffer would exceed limit - bounded memory
			}
		});

		this.ptyProcess.onExit(async () => {
			this.ptyProcess = null;

			if (this.disposed || this.state === "closed" || this.isDetaching) return;

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

				if (!this.disposed && !this.isDetaching) {
					await this.doAttach(
						this.lastDimensions.cols,
						this.lastDimensions.rows,
					);
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

	write(data: string): boolean {
		if (this.state !== "connected" || !this.ptyProcess) {
			return false;
		}
		this.ptyProcess.write(data);
		return true;
	}

	canWrite(): boolean {
		return this.state === "connected" && this.ptyProcess !== null;
	}

	/**
	 * Set the data handler and flush any buffered data.
	 * Call this after the session is stored so data isn't dropped.
	 */
	setDataHandler(handler: (data: string) => void): void {
		this.dataHandler = handler;
		// Flush buffered data
		for (const chunk of this.dataBuffer) {
			handler(chunk);
		}
		this.dataBuffer = [];
		this.dataBufferBytes = 0;
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

		this.isDetaching = true;

		// Clear buffer to release memory
		this.dataBuffer = [];
		this.dataBufferBytes = 0;

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

		// Clear buffer to release memory
		this.dataBuffer = [];
		this.dataBufferBytes = 0;

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

import { spawn } from "node:child_process";

export type AcpTransport = {
	pid?: number;
	send(line: string): void;
	close(): Promise<void>;
};

export type AcpTransportHandlers = {
	onLine(line: string): void;
	onStderr(chunk: string): void;
	onExit(code: number | null, signal: string | null): void;
};

export type SpawnAcpOptions = {
	command: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

const OWN_PROCESS_GROUP = process.platform !== "win32";
const CLOSE_GRACE_MS = 2000;
const EXIT_FLUSH_MS = 500;

function killProcessGroup(pid: number | undefined): void {
	if (!OWN_PROCESS_GROUP || pid === undefined) return;
	try {
		process.kill(-pid, "SIGKILL");
	} catch {}
}

export function spawnAcpTransport(
	options: SpawnAcpOptions,
	handlers: AcpTransportHandlers,
): AcpTransport {
	const child = spawn(options.command, options.args ?? [], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: ["pipe", "pipe", "pipe"],
		detached: OWN_PROCESS_GROUP,
	});

	let exited = false;
	let reported = false;
	let exitFlush: ReturnType<typeof setTimeout> | undefined;
	const reportExit = (code: number | null, signal: string | null) => {
		clearTimeout(exitFlush);
		exited = true;
		if (reported) return;
		reported = true;
		killProcessGroup(child.pid);
		handlers.onExit(code, signal);
	};

	child.on("error", (error) => {
		handlers.onStderr(`${error.message}\n`);
		reportExit(null, null);
	});
	child.stdin.on("error", (error) => {
		handlers.onStderr(`stdin: ${error.message}\n`);
		killProcessGroup(child.pid);
		child.kill("SIGKILL");
	});

	let pending = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		pending += chunk;
		let newline = pending.indexOf("\n");
		while (newline !== -1) {
			const line = pending.slice(0, newline);
			pending = pending.slice(newline + 1);
			if (line.trim().length > 0) handlers.onLine(line);
			newline = pending.indexOf("\n");
		}
	});
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => handlers.onStderr(chunk));
	child.on("exit", (code, signal) => {
		exitFlush = setTimeout(() => reportExit(code, signal), EXIT_FLUSH_MS);
	});
	child.on("close", (code, signal) => reportExit(code, signal));

	return {
		pid: child.pid,
		send: (line) => {
			if (!exited && child.stdin.writable) child.stdin.write(`${line}\n`);
		},
		close: async () => {
			if (exited) return;
			child.stdin.end();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					killProcessGroup(child.pid);
					child.kill("SIGKILL");
					resolve();
				}, CLOSE_GRACE_MS);
				child.once("close", () => {
					clearTimeout(timer);
					resolve();
				});
			});
		},
	};
}

export type AcpServerRequest = {
	id: number | string;
	method: string;
	params: unknown;
};
export type AcpNotification = { method: string; params: unknown };

export type AcpRpcClientOptions = {
	createTransport(handlers: AcpTransportHandlers): AcpTransport;
	onNotification(notification: AcpNotification): void;
	onServerRequest(request: AcpServerRequest): void;
	onDispatchError?(error: unknown, method: string): void;
	onStderr?(chunk: string): void;
	onExit?(code: number | null, signal: string | null): void;
};

export class AcpRpcError extends Error {
	constructor(
		readonly method: string,
		readonly code: number,
		/** The agent's own words, without the method that failed. */
		readonly detail: string,
	) {
		super(`${method}: ${detail}`);
		this.name = "AcpRpcError";
	}
}

export class AcpTimeoutError extends Error {
	constructor(
		readonly method: string,
		timeoutMs: number,
	) {
		const wait =
			timeoutMs < 1000 ? `${timeoutMs}ms` : `${Math.round(timeoutMs / 1000)}s`;
		super(`${method}: the agent did not answer within ${wait}`);
		this.name = "AcpTimeoutError";
	}
}

type PendingRequest = {
	method: string;
	resolve(result: unknown): void;
	reject(error: Error): void;
};

/**
 * Newline-delimited JSON-RPC 2.0 client for an ACP agent subprocess. Handles
 * request/response correlation, agent-initiated notifications, and
 * agent-initiated requests (permission prompts, fs, terminal).
 */
export class AcpRpcClient {
	private readonly transport: AcpTransport;
	private readonly pending = new Map<number, PendingRequest>();
	private nextId = 1;
	private closed = false;

	constructor(private readonly options: AcpRpcClientOptions) {
		this.transport = options.createTransport({
			onLine: (line) => this.receive(line),
			onStderr: (chunk) => options.onStderr?.(chunk),
			onExit: (code, signal) => this.handleExit(code, signal),
		});
	}

	request(
		method: string,
		params?: unknown,
		timeoutMs?: number,
	): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error(`${method}: acp agent closed`));
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer =
				timeoutMs === undefined
					? undefined
					: setTimeout(() => {
							if (!this.pending.delete(id)) return;
							reject(new AcpTimeoutError(method, timeoutMs));
						}, timeoutMs);
			this.pending.set(id, {
				method,
				resolve: (result) => {
					clearTimeout(timer);
					resolve(result);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
			this.write({ jsonrpc: "2.0", id, method, params: params ?? {} });
		});
	}

	notify(method: string, params?: unknown): void {
		if (this.closed) return;
		this.write({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
	}

	respond(id: number | string, result: unknown): void {
		this.write({ jsonrpc: "2.0", id, result });
	}

	respondWithError(id: number | string, code: number, message: string): void {
		this.write({ jsonrpc: "2.0", id, error: { code, message } });
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.transport.close();
		this.rejectPending("acp agent closed");
	}

	private write(frame: unknown): void {
		this.transport.send(JSON.stringify(frame));
	}

	private receive(line: string): void {
		let frame: {
			id?: number | string;
			method?: string;
			params?: unknown;
			result?: unknown;
			error?: { code: number; message: string };
		};
		try {
			frame = JSON.parse(line);
		} catch {
			this.options.onStderr?.(`unparseable acp frame: ${line}\n`);
			return;
		}

		const { id, method, params, result, error } = frame;

		if (method !== undefined) {
			try {
				if (id === undefined) this.options.onNotification({ method, params });
				else this.options.onServerRequest({ id, method, params });
			} catch (dispatchError) {
				if (id !== undefined) {
					this.respondWithError(
						id,
						-32603,
						"unhandled by superset chat runtime",
					);
				}
				this.options.onDispatchError?.(dispatchError, method);
			}
			return;
		}
		if (id === undefined || typeof id !== "number") return;

		const request = this.pending.get(id);
		if (!request) return;
		this.pending.delete(id);
		if (error !== undefined) {
			request.reject(
				new AcpRpcError(request.method, error.code, error.message),
			);
			return;
		}
		request.resolve(result);
	}

	private handleExit(code: number | null, signal: string | null): void {
		this.closed = true;
		this.rejectPending(
			`acp agent exited (code ${code ?? "null"}, signal ${signal ?? "null"})`,
		);
		this.options.onExit?.(code, signal);
	}

	private rejectPending(message: string): void {
		for (const [id, request] of [...this.pending]) {
			this.pending.delete(id);
			request.reject(new Error(`${request.method}: ${message}`));
		}
	}
}

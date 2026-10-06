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

export function spawnAcpTransport(
	options: SpawnAcpOptions,
	handlers: AcpTransportHandlers,
): AcpTransport {
	const child = spawn(options.command, options.args ?? [], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: ["pipe", "pipe", "pipe"],
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
	child.on("exit", (code, signal) => handlers.onExit(code, signal));

	let exited = false;
	child.on("close", () => {
		exited = true;
	});

	return {
		pid: child.pid,
		send: (line) => {
			if (!exited) child.stdin.write(`${line}\n`);
		},
		close: async () => {
			if (exited) return;
			child.stdin.end();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 2000);
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
		message: string,
	) {
		super(`${method}: ${message}`);
		this.name = "AcpRpcError";
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

	request(method: string, params?: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error(`${method}: acp agent closed`));
		}
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { method, resolve, reject });
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

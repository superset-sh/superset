import type { Socket } from "node:net";
import { TRPCError } from "@trpc/server";
import superjson from "superjson";

type Handler = (method: string, args: unknown[]) => Promise<unknown>;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;

/** Small, bidirectional local RPC. Requests are never replayed on reconnect:
 * a disconnected mutation may already have completed. */
export class AccountRpc {
	private sequence = 0;
	private buffer = "";
	private readonly pending = new Map<
		number,
		{
			resolve(value: unknown): void;
			reject(error: Error): void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	readonly active = new Set<Promise<unknown>>();
	constructor(
		readonly socket: Socket,
		private readonly handler: Handler,
	) {
		socket.setEncoding("utf8");
		socket.on("data", (chunk: string) => {
			this.buffer += chunk;
			if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES)
				return socket.destroy();
			while (this.buffer.includes("\n")) {
				const newline = this.buffer.indexOf("\n");
				const line = this.buffer.slice(0, newline);
				this.buffer = this.buffer.slice(newline + 1);
				try {
					this.receive(superjson.parse(line));
				} catch {
					socket.destroy();
				}
			}
		});
		socket.on("error", () => socket.destroy());
		socket.on("close", () => {
			for (const pending of this.pending.values()) {
				clearTimeout(pending.timer);
				pending.reject(new Error("account-owner-disconnected"));
			}
			this.pending.clear();
		});
	}
	private send(message: unknown): void {
		if (this.socket.destroyed) throw new Error("account-owner-disconnected");
		const frame = `${superjson.stringify(message)}\n`;
		if (Buffer.byteLength(frame) > MAX_FRAME_BYTES)
			throw new Error("account-owner-message-too-large");
		this.socket.write(frame);
	}
	request<T>(method: string, args: unknown[] = []): Promise<T> {
		const id = ++this.sequence;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("account-owner-timeout"));
			}, 120_000);
			this.pending.set(id, {
				resolve: (value) => resolve(value as T),
				reject,
				timer,
			});
			try {
				this.send({ id, method, args });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}
	private receive(message: {
		id?: unknown;
		method?: unknown;
		args?: unknown;
		error?: unknown;
		errorCode?: unknown;
		result?: unknown;
	}): void {
		if (!message || !Number.isSafeInteger(message.id))
			throw new Error("invalid RPC frame");
		const id = message.id as number;
		if (typeof message.method === "string" && Array.isArray(message.args)) {
			const work = Promise.resolve().then(() =>
				this.handler(message.method as string, message.args as unknown[]),
			);
			this.active.add(work);
			void work
				.then(
					(result) => {
						if (!this.socket.destroyed) this.send({ id, result });
					},
					(error) => {
						if (!this.socket.destroyed)
							this.send({
								id,
								error:
									error instanceof Error
										? error.message
										: "account-owner-error",
								errorCode: error instanceof TRPCError ? error.code : undefined,
							});
					},
				)
				.catch(() => this.socket.destroy())
				.finally(() => this.active.delete(work));
			return;
		}
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		clearTimeout(pending.timer);
		if (typeof message.error === "string")
			pending.reject(
				message.errorCode === "BAD_REQUEST" ||
					message.errorCode === "PRECONDITION_FAILED" ||
					message.errorCode === "FORBIDDEN"
					? new TRPCError({ code: message.errorCode, message: message.error })
					: new Error(message.error),
			);
		else pending.resolve(message.result);
	}
}

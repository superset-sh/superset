import type {
	HttpDialFrame,
	HttpResponseHeader,
} from "@superset/shared/tunnel-protocol";

const EXCHANGE_TIMEOUT_MS = 30_000;
// Chunked below the Durable Object's per-message ceiling.
const BODY_CHUNK_BYTES = 256 * 1024;

export interface HttpExchangeRequest {
	method: string;
	pathWithQuery: string;
	headers: Record<string, string>;
	body: Uint8Array<ArrayBuffer>;
}

export type HttpExchangeResult =
	| {
			ok: true;
			status: number;
			headers: Record<string, string>;
			body: Uint8Array<ArrayBuffer>;
	  }
	| { ok: false; reason: "timeout" | "dial-failed" };

interface Exchange {
	request: HttpExchangeRequest;
	resolve: (result: HttpExchangeResult) => void;
	header?: HttpResponseHeader;
	chunks: Uint8Array<ArrayBuffer>[];
	timer: ReturnType<typeof setTimeout>;
}

interface DialSocket {
	send(data: string | ArrayBuffer): void;
	close(code?: number, reason?: string): void;
}

// One request/response carried over a dialed WebSocket, for callers that
// cannot hold a socket themselves. Owns all exchange state so the tunnel
// server stays a pure splice.
export class HttpExchanges {
	private readonly exchanges = new Map<string, Exchange>();

	begin(
		ticket: string,
		request: HttpExchangeRequest,
	): Promise<HttpExchangeResult> {
		return new Promise((resolve) => {
			this.exchanges.set(ticket, {
				request,
				resolve,
				chunks: [],
				timer: setTimeout(() => {
					this.exchanges.delete(ticket);
					resolve({ ok: false, reason: "timeout" });
				}, EXCHANGE_TIMEOUT_MS),
			});
		});
	}

	has(ticket: string): boolean {
		return this.exchanges.has(ticket);
	}

	/** The host's dial-back socket arrived: push the request out on it. */
	onDialConnect(ticket: string, dial: DialSocket): void {
		const exchange = this.exchanges.get(ticket);
		if (!exchange) return;
		dial.send(
			JSON.stringify({
				type: "http:request",
				method: exchange.request.method,
				path: exchange.request.pathWithQuery,
				headers: exchange.request.headers,
			}),
		);
		const body = exchange.request.body;
		for (let offset = 0; offset < body.byteLength; offset += BODY_CHUNK_BYTES) {
			dial.send(body.slice(offset, offset + BODY_CHUNK_BYTES).buffer);
		}
		dial.send('{"type":"http:end"}');
	}

	onDialMessage(
		ticket: string,
		dial: DialSocket,
		message: string | ArrayBuffer | ArrayBufferView,
	): void {
		const exchange = this.exchanges.get(ticket);
		if (!exchange) return;

		if (typeof message !== "string") {
			const bytes =
				message instanceof ArrayBuffer
					? new Uint8Array(message)
					: new Uint8Array(
							message.buffer,
							message.byteOffset,
							message.byteLength,
						);
			exchange.chunks.push(bytes as Uint8Array<ArrayBuffer>);
			return;
		}

		let frame: HttpDialFrame;
		try {
			frame = JSON.parse(message) as HttpDialFrame;
		} catch {
			return;
		}
		if (frame.type === "http:response") {
			exchange.header = frame;
		} else if (frame.type === "http:end") {
			clearTimeout(exchange.timer);
			this.exchanges.delete(ticket);
			const size = exchange.chunks.reduce((n, c) => n + c.byteLength, 0);
			const body = new Uint8Array(size);
			let offset = 0;
			for (const chunk of exchange.chunks) {
				body.set(chunk, offset);
				offset += chunk.byteLength;
			}
			exchange.resolve({
				ok: true,
				status: exchange.header?.status ?? 502,
				headers: exchange.header?.headers ?? {},
				body: body as Uint8Array<ArrayBuffer>,
			});
			dial.close(1000, "Exchange complete");
		}
	}

	/** The host reported it could not dial back: fail now, not at the deadline. */
	fail(ticket: string): void {
		const exchange = this.exchanges.get(ticket);
		if (!exchange) return;
		clearTimeout(exchange.timer);
		this.exchanges.delete(ticket);
		exchange.resolve({ ok: false, reason: "dial-failed" });
	}

	abortAll(): void {
		for (const [, exchange] of this.exchanges) {
			clearTimeout(exchange.timer);
			exchange.resolve({ ok: false, reason: "timeout" });
		}
		this.exchanges.clear();
	}
}

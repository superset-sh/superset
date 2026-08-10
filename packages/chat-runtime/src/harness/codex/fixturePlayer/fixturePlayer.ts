import type { RecordedFrame } from "../fixtures";
import type { CodexTransport, CodexTransportHandlers } from "../rpcClient";

export class FixturePlayer {
	private index = 0;
	private handlers: CodexTransportHandlers | null = null;
	private pumping = false;
	private readonly sentMethods: string[] = [];

	constructor(private readonly frames: readonly RecordedFrame[]) {}

	get methodsSent(): readonly string[] {
		return this.sentMethods;
	}

	get exhausted(): boolean {
		return this.index >= this.frames.length;
	}

	transport(handlers: CodexTransportHandlers): CodexTransport {
		this.handlers = handlers;
		queueMicrotask(() => this.pump());
		return {
			send: (line) => this.onSend(line),
			close: async () => {
				this.handlers = null;
			},
		};
	}

	private onSend(line: string): void {
		const sent = JSON.parse(line) as { method?: string };
		if (sent.method) this.sentMethods.push(sent.method);

		const next = this.frames[this.index];
		if (next?.direction === "out") {
			const expected = (next.frame as { method?: string }).method;
			if (expected !== undefined && sent.method !== expected) {
				throw new Error(
					`fixture expected outgoing ${expected}, adapter sent ${sent.method ?? "response"}`,
				);
			}
			this.index += 1;
		}
		this.pump();
	}

	private pump(): void {
		if (this.pumping) return;
		this.pumping = true;
		try {
			while (this.index < this.frames.length) {
				const next = this.frames[this.index];
				if (!next || next.direction === "out") return;
				this.index += 1;
				this.handlers?.onLine(JSON.stringify(next.frame));
			}
		} finally {
			this.pumping = false;
		}
	}
}

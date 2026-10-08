import { type PagePresenceViewer, presenceViewersFrom } from "./page-presence";

interface WatchSocketEvent {
	data?: unknown;
	code?: number;
}

interface WatchSocket {
	send(data: string): void;
	close(): void;
	addEventListener(
		type: "message" | "close",
		listener: (event: WatchSocketEvent) => void,
	): void;
}

export interface PresenceWatch {
	stop(): void;
	wake(): void;
}

export function openPresenceWatch({
	url,
	onViewers,
	createSocket = (address) => new WebSocket(address) as unknown as WatchSocket,
	retryBaseMs = 1000,
	retryMaxMs = 30000,
	heartbeatMs = 25000,
}: {
	url: () => Promise<string | null>;
	onViewers: (viewers: PagePresenceViewer[]) => void;
	createSocket?: (address: string) => WatchSocket;
	retryBaseMs?: number;
	retryMaxMs?: number;
	heartbeatMs?: number;
}): PresenceWatch {
	let socket: WatchSocket | null = null;
	let stopped = false;
	let refused = false;
	let dialing = false;
	let attempts = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let beatTimer: ReturnType<typeof setTimeout> | null = null;
	let awaitingPong = false;
	let ponged = false;

	const clearBeat = () => {
		if (beatTimer) clearTimeout(beatTimer);
		beatTimer = null;
		awaitingPong = false;
		ponged = false;
	};

	const lost = (ws: WatchSocket, code?: number) => {
		if (ws !== socket) return;
		socket = null;
		clearBeat();
		if (code === 4403 || code === 4429) refused = true;
		onViewers([]);
		retry();
		try {
			ws.close();
		} catch {}
	};

	const beat = (ws: WatchSocket) => {
		beatTimer = setTimeout(() => {
			if (ws !== socket) return;
			if (awaitingPong && ponged) {
				lost(ws);
				return;
			}
			awaitingPong = true;
			try {
				ws.send("ping");
			} catch {}
			beat(ws);
		}, heartbeatMs);
	};

	const dial = async () => {
		if (stopped || refused || socket || dialing) return;
		dialing = true;
		const address = await url().catch(() => null);
		dialing = false;
		if (stopped || socket) return;
		if (!address) {
			retry();
			return;
		}
		const ws = createSocket(address);
		socket = ws;
		ws.addEventListener("message", (event) => {
			if (ws !== socket) return;
			if (event.data === "pong") {
				awaitingPong = false;
				ponged = true;
				return;
			}
			let message: { type?: unknown; viewers?: unknown };
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}
			if (message.type === "hello") {
				attempts = 0;
				awaitingPong = true;
				try {
					ws.send("ping");
				} catch {}
				beat(ws);
			}
			if (message.type === "presence") {
				onViewers(presenceViewersFrom(message.viewers));
			}
		});
		ws.addEventListener("close", (event) => lost(ws, event?.code));
	};

	const retry = () => {
		if (stopped || refused || socket || retryTimer) return;
		const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** attempts);
		attempts += 1;
		retryTimer = setTimeout(() => {
			retryTimer = null;
			void dial();
		}, delay);
	};

	void dial();

	return {
		stop() {
			stopped = true;
			if (retryTimer) clearTimeout(retryTimer);
			retryTimer = null;
			clearBeat();
			const ws = socket;
			socket = null;
			try {
				ws?.close();
			} catch {}
		},
		wake() {
			if (stopped || refused || socket) return;
			if (retryTimer) clearTimeout(retryTimer);
			retryTimer = null;
			attempts = 0;
			void dial();
		},
	};
}

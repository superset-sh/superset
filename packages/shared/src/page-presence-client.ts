import { type PagePresenceViewer, presenceViewersFrom } from "./page-presence";

interface PresenceSocketEvent {
	data?: unknown;
	code?: number;
}

interface PresenceSocket {
	send(data: string): void;
	close(): void;
	addEventListener(
		type: "open" | "message" | "close",
		listener: (event: PresenceSocketEvent) => void,
	): void;
}

export interface PagePresenceClient {
	wake(): void;
	stop(): void;
}

export function openPagePresence({
	url,
	onViewers,
	createSocket = (address) =>
		new WebSocket(address) as unknown as PresenceSocket,
	retryBaseMs = 1000,
	retryMaxMs = 30000,
	heartbeatMs = 25000,
}: {
	url: () => Promise<string | null>;
	onViewers: (viewers: PagePresenceViewer[]) => void;
	createSocket?: (address: string) => PresenceSocket;
	retryBaseMs?: number;
	retryMaxMs?: number;
	heartbeatMs?: number;
}): PagePresenceClient {
	let socket: PresenceSocket | null = null;
	let stopped = false;
	let refused = false;
	let dialing = false;
	let attempts = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let beatTimer: ReturnType<typeof setTimeout> | null = null;
	let awaitingPong = false;
	let ponged = false;

	const lost = (ws: PresenceSocket, code?: number) => {
		if (ws !== socket) return;
		socket = null;
		if (beatTimer) clearTimeout(beatTimer);
		beatTimer = null;
		awaitingPong = false;
		ponged = false;
		if (code === 4403 || code === 4429) refused = true;
		onViewers([]);
		retry();
		try {
			ws.close();
		} catch {}
	};

	const beat = (ws: PresenceSocket) => {
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
		ws.addEventListener("open", () => {
			if (ws !== socket) return;
			attempts = 0;
			awaitingPong = true;
			try {
				ws.send("ping");
			} catch {}
			beat(ws);
		});
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
		wake() {
			if (stopped || refused || socket) return;
			if (retryTimer) clearTimeout(retryTimer);
			retryTimer = null;
			attempts = 0;
			void dial();
		},
		stop() {
			stopped = true;
			if (retryTimer) clearTimeout(retryTimer);
			if (beatTimer) clearTimeout(beatTimer);
			retryTimer = null;
			beatTimer = null;
			const ws = socket;
			socket = null;
			try {
				ws?.close();
			} catch {}
		},
	};
}

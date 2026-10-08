import {
	PAGE_CURSOR_SEND_INTERVAL_MS,
	type PageCursor,
	type PagePresenceViewer,
	parsePageCursor,
	presenceViewersFrom,
} from "./page-presence";

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

export interface PagePresenceState {
	viewers: PagePresenceViewer[];
	cursors: ReadonlyMap<string, PageCursor>;
}

export interface PagePresenceClient {
	setCursor(cursor: PageCursor | null): void;
	wake(): void;
	stop(): void;
}

export function openPagePresence({
	url,
	onChange,
	createSocket = (address) =>
		new WebSocket(address) as unknown as PresenceSocket,
	retryBaseMs = 1000,
	retryMaxMs = 30000,
	heartbeatMs = 25000,
	cursorIntervalMs = PAGE_CURSOR_SEND_INTERVAL_MS,
}: {
	url: () => Promise<string | null>;
	onChange: (state: PagePresenceState) => void;
	createSocket?: (address: string) => PresenceSocket;
	retryBaseMs?: number;
	retryMaxMs?: number;
	heartbeatMs?: number;
	cursorIntervalMs?: number;
}): PagePresenceClient {
	let socket: PresenceSocket | null = null;
	let open = false;
	let stopped = false;
	let refused = false;
	let dialing = false;
	let attempts = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let beatTimer: ReturnType<typeof setTimeout> | null = null;
	let awaitingPong = false;
	let ponged = false;
	let viewers: PagePresenceViewer[] = [];
	const cursors = new Map<string, PageCursor>();
	let pending: PageCursor | null = null;
	let lastSent = "null";
	let lastSentAt = 0;
	let cursorTimer: ReturnType<typeof setTimeout> | null = null;

	const emit = () => onChange({ viewers, cursors: new Map(cursors) });

	const flushCursor = () => {
		cursorTimer = null;
		if (!socket || !open) return;
		const encoded = JSON.stringify(pending);
		if (encoded === lastSent) return;
		lastSent = encoded;
		lastSentAt = Date.now();
		try {
			socket.send(JSON.stringify({ type: "cursor", cursor: pending }));
		} catch {}
	};

	const queueCursor = () => {
		if (cursorTimer) return;
		cursorTimer = setTimeout(
			flushCursor,
			Math.max(0, lastSentAt + cursorIntervalMs - Date.now()),
		);
	};

	const lost = (ws: PresenceSocket, code?: number) => {
		if (ws !== socket) return;
		socket = null;
		open = false;
		if (beatTimer) clearTimeout(beatTimer);
		beatTimer = null;
		awaitingPong = false;
		ponged = false;
		lastSent = "null";
		if (code === 4403 || code === 4429) refused = true;
		viewers = [];
		cursors.clear();
		emit();
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

	const receive = (data: unknown) => {
		let message: {
			type?: unknown;
			viewers?: unknown;
			id?: unknown;
			cursor?: unknown;
		};
		try {
			message = JSON.parse(String(data));
		} catch {
			return;
		}
		if (message.type === "presence") {
			viewers = presenceViewersFrom(message.viewers);
			cursors.clear();
			for (const viewer of viewers) {
				if (viewer.cursor) cursors.set(viewer.id, viewer.cursor);
			}
			emit();
			return;
		}
		if (message.type === "cursor" && typeof message.id === "string") {
			const cursor = parsePageCursor(message.cursor);
			if (cursor === undefined) return;
			if (cursor) cursors.set(message.id, cursor);
			else cursors.delete(message.id);
			emit();
		}
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
			open = true;
			attempts = 0;
			awaitingPong = true;
			try {
				ws.send("ping");
			} catch {}
			beat(ws);
			queueCursor();
		});
		ws.addEventListener("message", (event) => {
			if (ws !== socket) return;
			if (event.data === "pong") {
				awaitingPong = false;
				ponged = true;
				return;
			}
			receive(event.data);
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
		setCursor(cursor) {
			pending = cursor;
			queueCursor();
		},
		wake() {
			if (stopped || refused || socket) return;
			if (retryTimer) clearTimeout(retryTimer);
			retryTimer = null;
			attempts = 0;
			void dial();
		},
		stop() {
			stopped = true;
			for (const timer of [retryTimer, beatTimer, cursorTimer]) {
				if (timer) clearTimeout(timer);
			}
			retryTimer = null;
			beatTimer = null;
			cursorTimer = null;
			const ws = socket;
			socket = null;
			try {
				ws?.close();
			} catch {}
		},
	};
}

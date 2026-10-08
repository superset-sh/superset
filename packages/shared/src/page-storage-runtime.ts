import { PAGE_ELEMENT_PATH_RUNTIME_SOURCE } from "./page-element-path";
import { PAGE_CURSOR_SEND_INTERVAL_MS } from "./page-presence";
import {
	MAX_PAGE_STORAGE_KEY_LENGTH,
	MAX_PAGE_STORAGE_VALUE_BYTES,
	PAGE_STORAGE_HOST_FLAG,
	STORAGE_FRAME_CHANNEL,
	STORAGE_HOST_CHANNEL,
} from "./page-storage";

const HELLO_TIMEOUT_MS = 2000;
const POLL_INTERVAL_MS = 60000;
const CALL_TIMEOUT_MS = 15000;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30000;
const HEARTBEAT_MS = 25000;

export function pageStorageRuntimeSource({
	helloTimeoutMs = HELLO_TIMEOUT_MS,
	cursorIntervalMs = PAGE_CURSOR_SEND_INTERVAL_MS,
	retryBaseMs = RETRY_BASE_MS,
	heartbeatMs = HEARTBEAT_MS,
}: {
	helloTimeoutMs?: number;
	cursorIntervalMs?: number;
	retryBaseMs?: number;
	heartbeatMs?: number;
} = {}): string {
	return `(() => {
	const FRAME = ${JSON.stringify(STORAGE_FRAME_CHANNEL)};
	const HOST = ${JSON.stringify(STORAGE_HOST_CHANNEL)};
	const MAX_VALUE_BYTES = ${MAX_PAGE_STORAGE_VALUE_BYTES};
	const MAX_KEY_LENGTH = ${MAX_PAGE_STORAGE_KEY_LENGTH};
	const HELLO_TIMEOUT_MS = ${helloTimeoutMs};
	const POLL_INTERVAL_MS = ${POLL_INTERVAL_MS};
	const CALL_TIMEOUT_MS = ${CALL_TIMEOUT_MS};
	const CURSOR_INTERVAL_MS = ${cursorIntervalMs};
	const RETRY_BASE_MS = ${retryBaseMs};
	const RETRY_MAX_MS = ${RETRY_MAX_MS};
	const HEARTBEAT_MS = ${heartbeatMs};
	const HOSTED = parent !== window || Boolean(window[${JSON.stringify(PAGE_STORAGE_HOST_FLAG)}]);
	const DOCUMENT = Math.random().toString(36).slice(2, 10);
	const paths = ${PAGE_ELEMENT_PATH_RUNTIME_SOURCE};

	const pending = new Map();
	const watchers = new Map();
	let seq = 0;
	let settleReady = null;
	let socket = null;
	let available = false;
	let identity = null;
	let revoked = false;
	let refused = false;
	let retryTimer = 0;
	let attempts = 0;
	let heartbeat = 0;
	let awaitingPong = false;
	let ponged = false;
	const remote = new Map();
	let tracking = false;
	let pointer = null;
	let lastCursor = "null";
	let lastCursorAt = 0;
	let cursorTimer = 0;
	let placeFrame = 0;

	const ready = new Promise((resolve) => {
		settleReady = resolve;
	});

	const settle = (value) => {
		if (!settleReady) return;
		const done = settleReady;
		settleReady = null;
		done(value);
	};

	const fail = (code, message) => {
		const error = new Error(message);
		error.code = code;
		return error;
	};

	const post = (message) => {
		parent.postMessage({ channel: FRAME, ...message }, "*");
	};

	const settleAll = (code, message) => {
		for (const [, entry] of pending) entry.reject(fail(code, message));
		pending.clear();
	};

	const deliver = (data) => {
		if (data.type === "result") {
			const entry = pending.get(data.id);
			if (!entry) return;
			pending.delete(data.id);
			if (data.ok) entry.resolve(data.result);
			else entry.reject(fail(data.code, data.message));
			return;
		}
		if (data.type === "records") {
			if (!available) return;
			const fns = watchers.get(data.key);
			if (fns) for (const fn of fns) fn.push(data.records);
			return;
		}
		if (data.type === "presence") {
			const viewers = Array.isArray(data.viewers) ? data.viewers : [];
			remote.clear();
			for (const viewer of viewers) {
				if (viewer.cursor) remote.set(viewer.id, viewer.cursor);
			}
			post({ type: "presence", viewers });
			schedulePlace();
			return;
		}
		if (data.type === "cursor") {
			if (data.cursor) remote.set(data.id, data.cursor);
			else remote.delete(data.id);
			schedulePlace();
			return;
		}
		if (data.type === "revoked") {
			revoked = true;
			settleAll("revoked", "Access to this page changed");
		}
	};

	const cursorAt = (x, y) => {
		const root = document.documentElement;
		const hit = document.elementFromPoint(x, y);
		const path = hit && hit !== root && hit !== document.body ? paths.pathOf(hit) : "";
		const r = (path ? hit : root).getBoundingClientRect();
		return {
			path,
			x: r.width > 0 ? (x - r.left) / r.width : 0,
			y: r.height > 0 ? (y - r.top) / r.height : 0,
		};
	};

	const sendCursor = () => {
		cursorTimer = 0;
		if (!socket || socket.readyState !== 1) return;
		const cursor = pointer && document.visibilityState === "visible"
			? cursorAt(pointer.x, pointer.y)
			: null;
		const encoded = JSON.stringify(cursor);
		if (encoded === lastCursor) return;
		lastCursor = encoded;
		lastCursorAt = Date.now();
		socket.send(JSON.stringify({ type: "cursor", cursor }));
	};

	const queueCursor = () => {
		if (cursorTimer) return;
		cursorTimer = setTimeout(
			sendCursor,
			Math.max(0, lastCursorAt + CURSOR_INTERVAL_MS - Date.now()),
		);
	};

	const place = () => {
		placeFrame = 0;
		paths.forget();
		const cursors = [];
		for (const [id, cursor] of remote) {
			const el = cursor.path ? paths.resolve(cursor.path) : document.documentElement;
			if (!el) continue;
			const r = el.getBoundingClientRect();
			cursors.push({ id, x: r.left + cursor.x * r.width, y: r.top + cursor.y * r.height });
		}
		post({ type: "cursors", cursors });
	};

	const schedulePlace = () => {
		if (!placeFrame) placeFrame = requestAnimationFrame(place);
	};

	const track = () => {
		if (tracking) return;
		tracking = true;
		addEventListener("pointermove", (event) => {
			if (event.pointerType === "touch") return;
			pointer = { x: event.clientX, y: event.clientY };
			queueCursor();
		}, { capture: true, passive: true });
		addEventListener("pointerout", (event) => {
			if (event.relatedTarget) return;
			pointer = null;
			queueCursor();
		}, true);
		addEventListener("scroll", () => {
			if (pointer) queueCursor();
			if (remote.size) schedulePlace();
		}, { capture: true, passive: true });
		addEventListener("resize", () => {
			if (remote.size) schedulePlace();
		});
		addEventListener("visibilitychange", queueCursor);
	};

	const forgetPresence = () => {
		lastCursor = "null";
		remote.clear();
		post({ type: "presence", viewers: [] });
		post({ type: "cursors", cursors: [] });
	};

	const lost = (ws, code) => {
		if (ws !== socket) return;
		socket = null;
		available = false;
		if (heartbeat) clearTimeout(heartbeat);
		heartbeat = 0;
		awaitingPong = false;
		ponged = false;
		if (code === 4403 || code === 4429) refused = true;
		forgetPresence();
		settle(false);
		if (!revoked) settleAll("unavailable", "The page's storage socket closed");
		retry();
		try { ws.close(); } catch {}
	};

	const beat = (ws) => {
		heartbeat = setTimeout(() => {
			if (ws !== socket) return;
			if (awaitingPong && ponged) { lost(ws); return; }
			awaitingPong = true;
			try { ws.send("ping"); } catch {}
			beat(ws);
		}, HEARTBEAT_MS);
	};

	const openSocket = (url) => {
		const ws = new WebSocket(url);
		socket = ws;
		ws.addEventListener("message", (event) => {
			if (ws !== socket) return;
			if (event.data === "pong") {
				awaitingPong = false;
				ponged = true;
				return;
			}
			let data;
			try { data = JSON.parse(event.data); } catch { return; }
			if (data.type === "hello") {
				attempts = 0;
				if (!heartbeat) {
					awaitingPong = true;
					try { ws.send("ping"); } catch {}
					beat(ws);
				}
				track();
				if (pointer) queueCursor();
				if (data.guest) {
					settle(false);
					return;
				}
				identity = { viewer: data.viewer, author: data.author, writable: data.writable };
				available = true;
				settle(true);
				revive();
				return;
			}
			deliver(data);
		});
		ws.addEventListener("close", (event) => lost(ws, event && event.code));
		ws.addEventListener("error", () => {
			if (ws === socket) settle(false);
		});
	};

	const retry = () => {
		if (!HOSTED || revoked || refused || socket || retryTimer) return;
		const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempts);
		attempts += 1;
		retryTimer = setTimeout(() => {
			retryTimer = 0;
			if (socket) return;
			post({ type: "hello" });
			retry();
		}, delay);
	};

	const retryNow = () => {
		if (!HOSTED || revoked || refused || socket) return;
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = 0;
		attempts = 0;
		post({ type: "hello" });
		retry();
	};

	if (!HOSTED) {
		settle(false);
	} else {
		const deadline = Date.now() + HELLO_TIMEOUT_MS;
		const knock = () => {
			if (!settleReady) return;
			if (Date.now() > deadline) {
				settle(false);
				retry();
				return;
			}
			post({ type: "hello" });
			setTimeout(knock, 200);
		};
		knock();
		addEventListener("online", retryNow);
		addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") retryNow();
		});
	}

	addEventListener("message", (event) => {
		const data = event.data;
		if (!data || data.channel !== HOST) return;
		if (event.source !== parent) return;
		if (data.type === "connect") {
			if (!socket) openSocket(data.url);
			return;
		}
	});

	const revive = () => {
		for (const [, fns] of watchers) {
			for (const fn of fns) fn.refresh();
		}
	};

	const call = async (request) => {
		if (revoked) throw fail("revoked", "Access to this page changed");
		if (!available) {
			await ready;
			if (!available) {
				throw fail("unavailable", "Page storage is not available in this view");
			}
		}
		const id = DOCUMENT + "." + ++seq;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			if (!socket || socket.readyState !== 1) {
				pending.delete(id);
				reject(fail("unavailable", "The page's storage socket is closed"));
				return;
			}
			socket.send(JSON.stringify({ type: "call", id, request }));
			setTimeout(() => {
				if (!pending.has(id)) return;
				pending.delete(id);
				reject(fail("unavailable", "Page storage did not answer"));
			}, CALL_TIMEOUT_MS);
		});
	};

	const checkKey = (key) => {
		if (typeof key !== "string" || !key.length || key.length > MAX_KEY_LENGTH) {
			throw fail("invalid", "A storage key is 1 to " + MAX_KEY_LENGTH + " characters");
		}
		return key;
	};

	const checkValue = (value) => {
		let encoded;
		try {
			encoded = JSON.stringify(value ?? null);
		} catch {
			throw fail("invalid", "A storage value must be JSON");
		}
		if (encoded === undefined) {
			throw fail("invalid", "A storage value must be JSON");
		}
		if (new TextEncoder().encode(encoded).length > MAX_VALUE_BYTES) {
			throw fail("quota_exceeded", "A storage value is at most " + MAX_VALUE_BYTES + " bytes");
		}
		return JSON.parse(encoded);
	};

	const storage = {
		ready,
		get viewer() { return identity ? identity.viewer : null; },
		get author() { return identity ? identity.author : false; },
		get writable() { return identity ? identity.writable : null; },
		async get(key) {
			const result = await call({ op: "get", key: checkKey(key) });
			return result.value ?? null;
		},
		async getAll(key) {
			const result = await call({ op: "getAll", key: checkKey(key) });
			return result.records || [];
		},
		async set(key, value) {
			await call({ op: "set", key: checkKey(key), value: checkValue(value) });
		},
		async remove(key) {
			await call({ op: "remove", key: checkKey(key) });
		},
		subscribe(key, onRecords) {
			checkKey(key);
			let stopped = false;
			let timer = 0;
			let inFlight = false;
			let again = false;

			const read = async () => {
				if (stopped) return;
				if (inFlight) { again = true; return; }
				inFlight = true;
				try {
					const records = await storage.getAll(key);
					if (!stopped) onRecords(records);
				} catch (error) {
					console.warn("superset.storage: subscription to " + key + " failed", error);
				}
				inFlight = false;
				if (again && !stopped) { again = false; read(); }
			};

			const entry = {
				refresh: read,
				push: (records) => { if (!stopped) onRecords(records); },
			};
			const fns = watchers.get(key) || new Set();
			fns.add(entry);
			watchers.set(key, fns);

			const tick = () => {
				read();
				if (!stopped && !available) {
					timer = setTimeout(tick, POLL_INTERVAL_MS);
				}
			};
			const onFocus = () => {
				if (document.visibilityState === "visible") read();
			};

			tick();
			addEventListener("visibilitychange", onFocus);
			addEventListener("focus", onFocus);
			return () => {
				stopped = true;
				if (timer) clearTimeout(timer);
				fns.delete(entry);
				if (!fns.size) watchers.delete(key);
				removeEventListener("visibilitychange", onFocus);
				removeEventListener("focus", onFocus);
			};
		},
	};

	window.superset = window.superset || {};
	window.superset.storage = storage;
})();`;
}

export const PAGE_STORAGE_RUNTIME_SOURCE = pageStorageRuntimeSource();

import {
	parseRealtimeNudgeMessage,
	type RealtimeNudgeMessage,
	realtimeNudgesPath,
} from "@superset/shared/realtime";
import { AppState } from "react-native";
import { env } from "@/lib/env";
import { getHostAuthToken } from "@/lib/host/client";
import { setRealtimeConnected } from "./connection";

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;
const OPEN_TIMEOUT_MS = 15_000;
// The Worker refuses a token by opening the socket and closing it at once.
const OPEN_SETTLE_MS = 2_000;
// A JWT minted before an org change is missing that org, so it answers 4403.
const STALE_TOKEN_CODES = new Set([4401, 4403]);

function nudgeUrl(organizationId: string, token: string): string {
	const url = new URL(
		`${env.EXPO_PUBLIC_REALTIME_URL}${realtimeNudgesPath(organizationId)}`,
	);
	if (url.protocol === "http:") url.protocol = "ws:";
	if (url.protocol === "https:") url.protocol = "wss:";
	url.searchParams.set("token", token);
	return url.toString();
}

/**
 * iOS drops sockets in the background, so this closes there and dials again
 * on return. `onReopen` fires when a socket opens after a failed or dropped one
 * in the foreground: a return from the background already refetches through
 * React Query's focus refetch.
 */
export function openNudgeSocket(args: {
	organizationId: string;
	onMessage: (message: RealtimeNudgeMessage) => void;
	onReopen: () => void;
}): () => void {
	let socket: WebSocket | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let retryMs = MIN_RETRY_MS;
	let refreshToken = false;
	let missedNudges = false;
	let dialing = false;
	let stopped = false;

	const drop = () => {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		const current = socket;
		socket = null;
		current?.close(1000, "unsubscribed");
		setRealtimeConnected(false);
	};

	const fail = () => {
		missedNudges = true;
		setRealtimeConnected(false);
		scheduleRetry();
	};

	const scheduleRetry = () => {
		if (stopped || retryTimer) return;
		retryTimer = setTimeout(() => void connect(), retryMs);
		retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
	};

	const connect = async () => {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = null;
		if (stopped || socket || dialing || AppState.currentState !== "active") {
			return;
		}
		dialing = true;
		let token: string;
		try {
			token = await getHostAuthToken({ forceRefresh: refreshToken });
		} catch {
			fail();
			return;
		} finally {
			dialing = false;
		}
		if (stopped || socket || AppState.currentState !== "active") return;
		refreshToken = false;

		const next = new WebSocket(nudgeUrl(args.organizationId, token));
		socket = next;
		let settleTimer: ReturnType<typeof setTimeout> | null = null;
		const openTimeout = setTimeout(() => {
			if (socket !== next) return;
			socket = null;
			next.close();
			fail();
		}, OPEN_TIMEOUT_MS);
		next.onopen = () => {
			clearTimeout(openTimeout);
			settleTimer = setTimeout(() => {
				if (socket !== next) return;
				retryMs = MIN_RETRY_MS;
				setRealtimeConnected(true);
				if (missedNudges) args.onReopen();
				missedNudges = false;
			}, OPEN_SETTLE_MS);
		};
		next.onmessage = (event) => {
			if (socket !== next) return;
			const message = parseRealtimeNudgeMessage(event.data);
			if (message) args.onMessage(message);
		};
		next.onclose = (event) => {
			clearTimeout(openTimeout);
			if (settleTimer) clearTimeout(settleTimer);
			if (socket !== next) return;
			socket = null;
			if (STALE_TOKEN_CODES.has(event.code)) refreshToken = true;
			fail();
		};
	};

	const appState = AppState.addEventListener("change", (state) => {
		if (state === "active") {
			retryMs = MIN_RETRY_MS;
			void connect();
		} else if (state === "background") {
			missedNudges = false;
			drop();
		}
	});

	void connect();
	return () => {
		stopped = true;
		appState.remove();
		drop();
	};
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CloudEvent {
	id: string;
	type:
		| "tool_call"
		| "tool_result"
		| "token"
		| "error"
		| "git_sync"
		| "execution_complete"
		| "heartbeat"
		| "user_message";
	timestamp: number;
	data: unknown;
	messageId?: string;
}

export interface HistoricalMessage {
	id: string;
	content: string;
	role: string;
	status: string;
	participantId: string | null;
	createdAt: number;
	completedAt: number | null;
}

export interface CloudSessionState {
	sessionId: string;
	status: string;
	sandboxStatus: string;
	repoOwner: string;
	repoName: string;
	branch: string;
	baseBranch: string;
	model: string;
	participants: Array<{
		id: string;
		userId: string;
		userName: string;
		avatarUrl?: string;
		source: string;
		isOnline: boolean;
	}>;
	messageCount: number;
	eventCount: number;
}

interface UseCloudSessionOptions {
	controlPlaneUrl: string;
	sessionId: string;
	authToken?: string;
}

interface UseCloudSessionReturn {
	isConnected: boolean;
	isConnecting: boolean;
	isLoadingHistory: boolean;
	isSpawning: boolean;
	error: string | null;
	sessionState: CloudSessionState | null;
	events: CloudEvent[];
	sendPrompt: (content: string) => void;
	sendStop: () => void;
	spawnSandbox: () => Promise<void>;
	connect: () => void;
	disconnect: () => void;
}

export function useCloudSession({
	controlPlaneUrl,
	sessionId,
	authToken,
}: UseCloudSessionOptions): UseCloudSessionReturn {
	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [isSpawning, setIsSpawning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sessionState, setSessionState] = useState<CloudSessionState | null>(
		null,
	);
	const [events, setEvents] = useState<CloudEvent[]>([]);

	const wsRef = useRef<WebSocket | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttempts = useRef(0);
	const maxReconnectAttempts = 5;
	const isCleaningUp = useRef(false);
	const hasAttemptedSpawn = useRef(false);

	// Store config in refs to avoid dependency changes
	const configRef = useRef({ controlPlaneUrl, sessionId, authToken });
	configRef.current = { controlPlaneUrl, sessionId, authToken };

	const cleanup = useCallback(() => {
		if (pingIntervalRef.current) {
			clearInterval(pingIntervalRef.current);
			pingIntervalRef.current = null;
		}
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
	}, []);

	const handleMessage = useCallback(
		(message: {
			type: string;
			sessionId?: string;
			state?: CloudSessionState;
			event?: CloudEvent;
			messages?: HistoricalMessage[];
			message?: string;
		}) => {
			switch (message.type) {
				case "subscribed":
					if (message.state) {
						setSessionState(message.state);
					}
					break;

				case "history":
					// Convert historical messages to events for display
					if (message.messages && message.messages.length > 0) {
						const userMessageEvents: CloudEvent[] = message.messages
							.filter((m) => m.role === "user")
							.map((m) => ({
								id: m.id,
								type: "user_message" as const,
								timestamp: m.createdAt,
								data: { content: m.content },
								messageId: m.id,
							}));
						setEvents((prev) => [...userMessageEvents, ...prev]);
					}
					setIsLoadingHistory(false);
					break;

				case "event":
					if (message.event) {
						setEvents((prev) => [...prev, message.event as CloudEvent]);
						// Mark history as loaded once we receive live events
						setIsLoadingHistory(false);
					}
					break;

				case "state_update":
					if (message.state) {
						setSessionState((prev) =>
							prev
								? { ...prev, ...message.state }
								: (message.state as CloudSessionState),
						);
					}
					break;

				case "error":
					setError(message.message || "Unknown error");
					setIsLoadingHistory(false);
					break;

				case "pong":
					// Heartbeat response
					break;
			}
		},
		[],
	);

	const connectInternal = useCallback(() => {
		// Don't connect if we're cleaning up
		if (isCleaningUp.current) {
			return;
		}

		// Don't create duplicate connections
		if (
			wsRef.current?.readyState === WebSocket.OPEN ||
			wsRef.current?.readyState === WebSocket.CONNECTING
		) {
			return;
		}

		const { controlPlaneUrl, sessionId, authToken } = configRef.current;

		setIsConnecting(true);
		setError(null);

		const wsUrl = controlPlaneUrl
			.replace("https://", "wss://")
			.replace("http://", "ws://");

		const url = `${wsUrl}/api/sessions/${sessionId}/ws`;

		try {
			const ws = new WebSocket(url);
			wsRef.current = ws;

			ws.onopen = () => {
				// Check if we're still supposed to be connected
				if (isCleaningUp.current) {
					ws.close();
					return;
				}

				setIsConnecting(false);
				setIsConnected(true);
				reconnectAttempts.current = 0;

				// Send subscribe message
				ws.send(
					JSON.stringify({
						type: "subscribe",
						token: authToken || "",
					}),
				);

				// Start ping interval
				pingIntervalRef.current = setInterval(() => {
					if (ws.readyState === WebSocket.OPEN) {
						ws.send(JSON.stringify({ type: "ping" }));
					}
				}, 30000);
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data as string);
					handleMessage(message);
				} catch (e) {
					console.error("[cloud-session] Failed to parse message:", e);
				}
			};

			ws.onclose = () => {
				cleanup();
				setIsConnected(false);
				wsRef.current = null;

				// Don't reconnect if we're cleaning up
				if (isCleaningUp.current) {
					return;
				}

				// Attempt reconnect
				if (reconnectAttempts.current < maxReconnectAttempts) {
					reconnectAttempts.current++;
					const delay = 1000 * 2 ** (reconnectAttempts.current - 1);
					reconnectTimeoutRef.current = setTimeout(() => {
						connectInternal();
					}, delay);
				}
			};

			ws.onerror = () => {
				setError("WebSocket connection error");
				setIsConnecting(false);
			};
		} catch (_e) {
			setError("Failed to create WebSocket connection");
			setIsConnecting(false);
		}
	}, [cleanup, handleMessage]);

	const disconnectInternal = useCallback(() => {
		isCleaningUp.current = true;
		cleanup();
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		setIsConnected(false);
		reconnectAttempts.current = maxReconnectAttempts; // Prevent auto-reconnect
	}, [cleanup]);

	// Stable public functions
	const connect = useCallback(() => {
		isCleaningUp.current = false;
		reconnectAttempts.current = 0;
		connectInternal();
	}, [connectInternal]);

	const disconnect = useCallback(() => {
		disconnectInternal();
	}, [disconnectInternal]);

	const sendPrompt = useCallback((content: string) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			// Add user message to events immediately for display
			const userMessageEvent: CloudEvent = {
				id: `user-${Date.now()}`,
				type: "user_message",
				timestamp: Date.now(),
				data: { content },
			};
			setEvents((prev) => [...prev, userMessageEvent]);

			wsRef.current.send(
				JSON.stringify({
					type: "prompt",
					content,
					authorId: "web-user",
				}),
			);
		}
	}, []);

	const sendStop = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "stop" }));
		}
	}, []);

	const spawnSandbox = useCallback(async () => {
		const { controlPlaneUrl, sessionId } = configRef.current;

		if (isSpawning) {
			return;
		}

		setIsSpawning(true);
		try {
			const response = await fetch(
				`${controlPlaneUrl}/api/sessions/${sessionId}/spawn-sandbox`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
				},
			);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error("[cloud-session] Failed to spawn sandbox:", errorData);
				setError("Failed to spawn sandbox");
			} else {
				console.log("[cloud-session] Sandbox spawn initiated");
			}
		} catch (e) {
			console.error("[cloud-session] Error spawning sandbox:", e);
			setError("Failed to spawn sandbox");
		} finally {
			setIsSpawning(false);
		}
	}, [isSpawning]);

	// Auto-spawn sandbox when connected but sandbox is stopped
	useEffect(() => {
		if (
			isConnected &&
			sessionState?.sandboxStatus === "stopped" &&
			!hasAttemptedSpawn.current &&
			!isSpawning
		) {
			hasAttemptedSpawn.current = true;
			console.log(
				"[cloud-session] Sandbox is stopped, auto-spawning...",
			);
			spawnSandbox();
		}
	}, [isConnected, sessionState?.sandboxStatus, isSpawning, spawnSandbox]);

	// Reset spawn attempt when session changes
	useEffect(() => {
		hasAttemptedSpawn.current = false;
	}, [sessionId]);

	// Auto-connect on mount, only re-run if controlPlaneUrl or sessionId change
	useEffect(() => {
		if (controlPlaneUrl && sessionId) {
			isCleaningUp.current = false;
			reconnectAttempts.current = 0;
			connectInternal();
		}

		return () => {
			disconnectInternal();
		};
	}, [controlPlaneUrl, sessionId, connectInternal, disconnectInternal]);

	return {
		isConnected,
		isConnecting,
		isLoadingHistory,
		isSpawning,
		error,
		sessionState,
		events,
		sendPrompt,
		sendStop,
		spawnSandbox,
		connect,
		disconnect,
	};
}

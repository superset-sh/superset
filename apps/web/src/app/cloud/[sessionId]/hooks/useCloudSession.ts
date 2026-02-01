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

interface PendingPrompt {
	content: string;
	timestamp: number;
}

interface UseCloudSessionReturn {
	isConnected: boolean;
	isConnecting: boolean;
	isReconnecting: boolean;
	reconnectAttempt: number;
	isLoadingHistory: boolean;
	isSpawning: boolean;
	isProcessing: boolean;
	isSandboxReady: boolean;
	isControlPlaneAvailable: boolean;
	spawnAttempt: number;
	maxSpawnAttempts: number;
	error: string | null;
	sessionState: CloudSessionState | null;
	events: CloudEvent[];
	pendingPrompts: PendingPrompt[];
	sendPrompt: (content: string) => void;
	sendStop: () => void;
	sendTyping: () => void;
	spawnSandbox: () => Promise<void>;
	connect: () => void;
	disconnect: () => void;
	clearError: () => void;
}

export function useCloudSession({
	controlPlaneUrl,
	sessionId,
	authToken,
}: UseCloudSessionOptions): UseCloudSessionReturn {
	const [isConnected, setIsConnected] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [isReconnecting, setIsReconnecting] = useState(false);
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [isSpawning, setIsSpawning] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [isControlPlaneAvailable, setIsControlPlaneAvailable] = useState(true);
	const [spawnAttempt, setSpawnAttempt] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [sessionState, setSessionState] = useState<CloudSessionState | null>(
		null,
	);
	const [events, setEvents] = useState<CloudEvent[]>([]);
	const [pendingPrompts, setPendingPrompts] = useState<PendingPrompt[]>([]);

	// Compute if sandbox is ready for prompts
	const isSandboxReady =
		sessionState?.sandboxStatus === "ready" ||
		sessionState?.sandboxStatus === "running";

	const wsRef = useRef<WebSocket | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const spawnRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastSandboxHeartbeat = useRef<number>(Date.now());
	const reconnectAttempts = useRef(0);
	const spawnAttempts = useRef(0);
	const maxReconnectAttempts = 5;
	const maxSpawnAttempts = 3;
	const sandboxHeartbeatTimeout = 60000; // 60 seconds without heartbeat = stale
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
		if (spawnRetryTimeoutRef.current) {
			clearTimeout(spawnRetryTimeoutRef.current);
			spawnRetryTimeoutRef.current = null;
		}
		if (heartbeatTimeoutRef.current) {
			clearTimeout(heartbeatTimeoutRef.current);
			heartbeatTimeoutRef.current = null;
		}
	}, []);

	const clearError = useCallback(() => {
		setError(null);
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
						const event = message.event as CloudEvent;
						setEvents((prev) => [...prev, event]);
						// Mark history as loaded once we receive live events
						setIsLoadingHistory(false);

						// Track processing state based on event type
						if (event.type === "execution_complete") {
							setIsProcessing(false);
						}

						// Track sandbox heartbeats for stale detection
						if (event.type === "heartbeat") {
							lastSandboxHeartbeat.current = Date.now();
						}
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
				setIsReconnecting(false);
				setReconnectAttempt(0);
				setIsConnected(true);
				setIsControlPlaneAvailable(true);
				reconnectAttempts.current = 0;
				lastSandboxHeartbeat.current = Date.now();

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
					setIsReconnecting(false);
					setReconnectAttempt(0);
					return;
				}

				// Attempt reconnect
				if (reconnectAttempts.current < maxReconnectAttempts) {
					reconnectAttempts.current++;
					setIsReconnecting(true);
					setReconnectAttempt(reconnectAttempts.current);
					const delay = 1000 * 2 ** (reconnectAttempts.current - 1);
					reconnectTimeoutRef.current = setTimeout(() => {
						connectInternal();
					}, delay);
				} else {
					setIsReconnecting(false);
					setIsControlPlaneAvailable(false);
					setError("Connection lost. Control plane may be unavailable.");
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

	const sendPrompt = useCallback(
		(content: string) => {
			// Add user message to events immediately for display
			const userMessageEvent: CloudEvent = {
				id: `user-${Date.now()}`,
				type: "user_message",
				timestamp: Date.now(),
				data: { content },
			};
			setEvents((prev) => [...prev, userMessageEvent]);

			if (wsRef.current?.readyState === WebSocket.OPEN) {
				// Set processing state
				setIsProcessing(true);

				wsRef.current.send(
					JSON.stringify({
						type: "prompt",
						content,
						authorId: "web-user",
					}),
				);
			} else {
				// Queue prompt for when connection is restored
				console.log("[cloud-session] Connection not ready, queueing prompt");
				setPendingPrompts((prev) => [
					...prev,
					{ content, timestamp: Date.now() },
				]);
			}
		},
		[],
	);

	const sendStop = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "stop" }));
		}
	}, []);

	// Debounce timer for typing events
	const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
	const hasTypedRef = useRef(false);

	const sendTyping = useCallback(() => {
		// Only send once per session until sandbox is ready
		if (hasTypedRef.current || isSandboxReady) {
			return;
		}

		// Debounce - wait 500ms before actually sending
		if (typingDebounceRef.current) {
			clearTimeout(typingDebounceRef.current);
		}

		typingDebounceRef.current = setTimeout(() => {
			if (
				wsRef.current?.readyState === WebSocket.OPEN &&
				!hasTypedRef.current &&
				!isSandboxReady
			) {
				hasTypedRef.current = true;
				wsRef.current.send(JSON.stringify({ type: "typing" }));
				console.log("[cloud-session] Sent typing indicator for pre-warming");
			}
		}, 500);
	}, [isSandboxReady]);

	const spawnSandbox = useCallback(async () => {
		const { controlPlaneUrl, sessionId } = configRef.current;

		if (isSpawning) {
			return;
		}

		setIsSpawning(true);
		setError(null);

		const attemptSpawn = async (): Promise<boolean> => {
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
					return false;
				}

				console.log("[cloud-session] Sandbox spawn initiated");
				spawnAttempts.current = 0;
				setSpawnAttempt(0);
				return true;
			} catch (e) {
				console.error("[cloud-session] Error spawning sandbox:", e);
				return false;
			}
		};

		const success = await attemptSpawn();

		if (!success) {
			spawnAttempts.current++;
			setSpawnAttempt(spawnAttempts.current);

			if (spawnAttempts.current < maxSpawnAttempts) {
				const delay = 2000 * 2 ** (spawnAttempts.current - 1); // 2s, 4s, 8s
				console.log(
					`[cloud-session] Spawn failed, retrying in ${delay}ms (attempt ${spawnAttempts.current + 1}/${maxSpawnAttempts})`,
				);

				spawnRetryTimeoutRef.current = setTimeout(() => {
					setIsSpawning(false);
					spawnSandbox();
				}, delay);
				return;
			}

			setError(
				`Failed to spawn sandbox after ${maxSpawnAttempts} attempts. Please try again.`,
			);
		}

		setIsSpawning(false);
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

	// Reset spawn attempt and typing state when session changes
	useEffect(() => {
		hasAttemptedSpawn.current = false;
		hasTypedRef.current = false;
		spawnAttempts.current = 0;
		setSpawnAttempt(0);
		if (typingDebounceRef.current) {
			clearTimeout(typingDebounceRef.current);
			typingDebounceRef.current = null;
		}
	}, [sessionId]);

	// Reset typing state when sandbox becomes ready
	useEffect(() => {
		if (isSandboxReady) {
			hasTypedRef.current = false;
		}
	}, [isSandboxReady]);

	// Send pending prompts when connection is restored and sandbox is ready
	useEffect(() => {
		if (
			isConnected &&
			isSandboxReady &&
			pendingPrompts.length > 0 &&
			wsRef.current?.readyState === WebSocket.OPEN
		) {
			// Send the oldest pending prompt
			const [nextPrompt, ...remaining] = pendingPrompts;
			if (nextPrompt) {
				console.log(
					"[cloud-session] Sending queued prompt:",
					nextPrompt.content.substring(0, 50),
				);
				setIsProcessing(true);
				wsRef.current.send(
					JSON.stringify({
						type: "prompt",
						content: nextPrompt.content,
						authorId: "web-user",
					}),
				);
				setPendingPrompts(remaining);
			}
		}
	}, [isConnected, isSandboxReady, pendingPrompts]);

	// Monitor sandbox heartbeat for stale detection
	useEffect(() => {
		if (!isConnected || !isSandboxReady) {
			return;
		}

		const checkHeartbeat = () => {
			const timeSinceLastHeartbeat = Date.now() - lastSandboxHeartbeat.current;
			if (timeSinceLastHeartbeat > sandboxHeartbeatTimeout) {
				console.warn(
					"[cloud-session] Sandbox appears stale, no heartbeat for",
					Math.round(timeSinceLastHeartbeat / 1000),
					"seconds",
				);
				// Reset spawn tracking and attempt respawn
				hasAttemptedSpawn.current = false;
				spawnAttempts.current = 0;
				setSpawnAttempt(0);
				spawnSandbox();
			}
		};

		// Check heartbeat every 30 seconds
		heartbeatTimeoutRef.current = setInterval(checkHeartbeat, 30000);

		return () => {
			if (heartbeatTimeoutRef.current) {
				clearInterval(heartbeatTimeoutRef.current);
				heartbeatTimeoutRef.current = null;
			}
		};
	}, [isConnected, isSandboxReady, spawnSandbox]);

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
		isReconnecting,
		reconnectAttempt,
		isLoadingHistory,
		isSpawning,
		isProcessing,
		isSandboxReady,
		isControlPlaneAvailable,
		spawnAttempt,
		maxSpawnAttempts,
		error,
		sessionState,
		events,
		pendingPrompts,
		sendPrompt,
		sendStop,
		sendTyping,
		spawnSandbox,
		connect,
		disconnect,
		clearError,
	};
}

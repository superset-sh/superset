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

export type ArtifactType = "pr" | "preview" | "screenshot" | "file";

export interface Artifact {
	id: string;
	type: ArtifactType;
	url: string | null;
	title: string | null;
	description: string | null;
	metadata: Record<string, unknown> | null;
	status: "active" | "deleted";
	createdAt: number;
	updatedAt: number;
}

export interface FileChange {
	path: string;
	type: "added" | "modified" | "deleted";
	lastModified: number;
}

export interface ParticipantPresence {
	id: string;
	userId: string;
	userName: string;
	avatarUrl?: string;
	source: "web" | "desktop" | "slack";
	isOnline: boolean;
	lastSeenAt: number;
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
	participants: ParticipantPresence[];
	artifacts: Artifact[];
	filesChanged: FileChange[];
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

	// Track seen event IDs for deduplication across reconnections
	const seenEventIds = useRef<Set<string>>(new Set());

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
			artifacts?: Artifact[];
			participants?: ParticipantPresence[];
			action?: "join" | "leave" | "idle" | "active";
			participant?: ParticipantPresence;
			message?: string;
			// For prompt_ack messages
			messageId?: string;
			status?: "forwarded" | "queued" | "sent" | "failed";
		}) => {
			switch (message.type) {
				case "subscribed":
					console.log("[cloud-session] subscribed received, sandboxStatus:", message.state?.sandboxStatus);
					if (message.state) {
						setSessionState(message.state);
					}
					// Server always sends history after subscribed, but if session is empty
					// or there's an issue, ensure we don't stay in loading state forever
					setIsLoadingHistory(false);
					break;

				case "history":
					// Convert historical messages to events for display
					// Deduplicate by ID to handle reconnection scenarios
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

						// Filter out already seen messages and update seen set
						const newEvents = userMessageEvents.filter((e) => {
							if (seenEventIds.current.has(e.id)) {
								return false;
							}
							seenEventIds.current.add(e.id);
							return true;
						});

						if (newEvents.length > 0) {
							setEvents((prev) => {
								// Double-check for any IDs that slipped through
								const existingIds = new Set(prev.map((e) => e.id));
								const uniqueNewEvents = newEvents.filter(
									(e) => !existingIds.has(e.id),
								);
								// Prepend historical user messages, maintaining order
								return [...uniqueNewEvents, ...prev];
							});
						}
					}
					setIsLoadingHistory(false);
					break;

				case "event":
					if (message.event) {
						const event = message.event as CloudEvent;

						// Deduplicate by ID to handle reconnection scenarios
						if (seenEventIds.current.has(event.id)) {
							// Still process side effects for duplicate events
							if (event.type === "execution_complete") {
								setIsProcessing(false);
							}
							if (event.type === "heartbeat") {
								lastSandboxHeartbeat.current = Date.now();
							}
							break;
						}

						seenEventIds.current.add(event.id);
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
					console.log("[cloud-session] state_update received:", message.state);
					if (message.state) {
						setSessionState((prev) => {
							const newState = prev
								? { ...prev, ...message.state }
								: (message.state as CloudSessionState);
							console.log("[cloud-session] New session state sandboxStatus:", newState.sandboxStatus);
							return newState;
						});
					}
					break;

				case "artifacts_update":
					if (message.artifacts) {
						setSessionState((prev) =>
							prev
								? { ...prev, artifacts: message.artifacts as Artifact[] }
								: null,
						);
					}
					break;

				case "presence_sync":
					// Full sync of all participants (on initial subscribe)
					if (message.participants) {
						setSessionState((prev) =>
							prev
								? { ...prev, participants: message.participants as ParticipantPresence[] }
								: null,
						);
					}
					break;

				case "presence_update":
					// Incremental update for a single participant
					if (message.participant && message.action) {
						setSessionState((prev) => {
							if (!prev) return null;

							const participant = message.participant as ParticipantPresence;
							const action = message.action;

							if (action === "join") {
								// Add participant if not already present
								const exists = prev.participants.some((p) => p.id === participant.id);
								if (exists) {
									// Update existing participant
									return {
										...prev,
										participants: prev.participants.map((p) =>
											p.id === participant.id ? { ...participant, isOnline: true } : p,
										),
									};
								}
								return {
									...prev,
									participants: [...prev.participants, { ...participant, isOnline: true }],
								};
							}

							if (action === "leave") {
								// Mark participant as offline (don't remove from list)
								return {
									...prev,
									participants: prev.participants.map((p) =>
										p.id === participant.id ? { ...p, isOnline: false, lastSeenAt: participant.lastSeenAt } : p,
									),
								};
							}

							if (action === "idle" || action === "active") {
								// Update online status
								return {
									...prev,
									participants: prev.participants.map((p) =>
										p.id === participant.id
											? { ...p, isOnline: action === "active", lastSeenAt: participant.lastSeenAt }
											: p,
									),
								};
							}

							return prev;
						});
					}
					break;

				case "error":
					setError(message.message || "Unknown error");
					setIsLoadingHistory(false);
					break;

				case "prompt_ack":
					// Handle prompt acknowledgment from control plane
					if (message.status === "queued") {
						// Prompt was queued, not processing - sandbox not connected
						console.log("[cloud-session] Prompt queued:", message.messageId, message.message);
						// Don't set isProcessing to true - it will be processed when sandbox connects
						setIsProcessing(false);
						// Optionally show a notification to user
						if (message.message) {
							setError(message.message);
						}
					} else if (message.status === "forwarded") {
						// Prompt was forwarded to sandbox, keep isProcessing true
						console.log("[cloud-session] Prompt forwarded to sandbox:", message.messageId);
					}
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
					console.log("[cloud-session] Received message type:", message.type);
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

	const sendPrompt = useCallback((content: string) => {
		// Add user message to events immediately for display
		// Use a unique ID that won't collide with server-generated IDs
		const localId = `local-user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
		const userMessageEvent: CloudEvent = {
			id: localId,
			type: "user_message",
			timestamp: Date.now(),
			data: { content },
		};

		// Track this local ID as seen
		seenEventIds.current.add(localId);
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
	}, []);

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

	// Auto-spawn sandbox when connected but sandbox needs starting
	// Note: Server-side guard prevents duplicate spawns even if this fires multiple times
	useEffect(() => {
		const status = sessionState?.sandboxStatus;
		// Only spawn if status indicates the sandbox is truly stopped/pending
		// Don't spawn if it's in any "active" state (warming, syncing, ready, running)
		const needsSpawn = status === "stopped" || status === "pending" || status === "failed";
		const isActive = status === "warming" || status === "syncing" || status === "ready" || status === "running";

		// Skip spawn if sandbox is already active
		if (isActive) {
			console.log(`[cloud-session] Sandbox is active (${status}), skipping spawn`);
			return;
		}

		if (
			isConnected &&
			needsSpawn &&
			!hasAttemptedSpawn.current &&
			!isSpawning
		) {
			hasAttemptedSpawn.current = true;
			console.log(`[cloud-session] Sandbox status is ${status}, auto-spawning...`);
			spawnSandbox();
		}
	}, [isConnected, sessionState?.sandboxStatus, isSpawning, spawnSandbox]);

	// Reset spawn attempt, typing state, and seen events when session changes
	useEffect(() => {
		hasAttemptedSpawn.current = false;
		hasTypedRef.current = false;
		spawnAttempts.current = 0;
		setSpawnAttempt(0);
		// Clear seen events for new session
		seenEventIds.current.clear();
		setEvents([]);
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

/**
 * Self-contained chat hook that owns the entire session lifecycle.
 *
 * Clients just pass sessionId + auth config. Internally this hook:
 * 1. Acquires a cached SessionDB (ref-counted, survives tab switches)
 * 2. Handles preload → ready state
 * 3. Subscribes to the messages collection via useSyncExternalStore
 * 4. Exposes metadata (title, config, presence) via embedded useChatMetadata
 * 5. Provides sendMessage / stop actions as simple POSTs
 */

import { createOptimisticAction } from "@durable-streams/state";
import { type FileUIPart, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChunkRow } from "../../schema";
import { messageRowToUIMessage } from "../../session-db/collections/messages/materialize";
import {
	type UseChatMetadataReturn,
	useChatMetadata,
} from "./hooks/useChatMetadata";
import { useCollectionData } from "./hooks/useCollectionData";
import { getSessionDB } from "./utils/session-db-cache";

export interface UseChatOptions {
	sessionId: string | null;
	proxyUrl: string;
	getHeaders?: () => Record<string, string>;
}

export interface MessageMetadata {
	model?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

export interface SendMessageOptions {
	messageId?: string;
	txid?: string;
	signal?: AbortSignal;
}

export type AddToolOutputOptions =
	| {
			tool: string;
			toolCallId: string;
			output: unknown;
			state?: "output-available";
	  }
	| {
			tool: string;
			toolCallId: string;
			state: "output-error";
			errorText: string;
	  };

export interface UseChatReturn {
	ready: boolean;
	messages: (UIMessage & { actorId: string; createdAt: Date })[];
	isLoading: boolean;
	sendMessage: (
		text: string,
		files?: FileUIPart[],
		metadata?: MessageMetadata,
		options?: SendMessageOptions,
	) => Promise<void>;
	stop: () => void;
	addToolOutput: (options: AddToolOutputOptions) => Promise<void>;
	submitApproval: (
		approvalId: string,
		approved: boolean,
		toolCallId?: string,
	) => Promise<void>;
	error: string | null;
	metadata: UseChatMetadataReturn;
}

const STALE_THRESHOLD_MS = 30_000;

type ToolOutputSnapshot =
	| { state: "output-available"; output: unknown }
	| { state: "output-error"; errorText: string };

function parseToolOutputs(rows: ChunkRow[]): Map<string, ToolOutputSnapshot> {
	const outputs = new Map<string, ToolOutputSnapshot>();
	const sorted = [...rows].sort((a, b) => {
		const time = a.createdAt.localeCompare(b.createdAt);
		return time !== 0 ? time : a.seq - b.seq;
	});

	for (const row of sorted) {
		try {
			const parsed = JSON.parse(row.chunk) as
				| {
						type?: string;
						toolCallId?: string;
						state?: "output-available" | "output-error";
						output?: unknown;
						errorText?: string;
				  }
				| undefined;

			if (
				parsed?.type !== "tool-output" ||
				typeof parsed.toolCallId !== "string"
			) {
				continue;
			}

			if (parsed.state === "output-error") {
				outputs.set(parsed.toolCallId, {
					state: "output-error",
					errorText: parsed.errorText ?? "Tool output error",
				});
				continue;
			}

			outputs.set(parsed.toolCallId, {
				state: "output-available",
				output: parsed.output,
			});
		} catch {
			// ignore malformed custom chunks
		}
	}

	return outputs;
}

function applyToolOutputs(
	messages: (UIMessage & { actorId: string; createdAt: Date })[],
	toolOutputs: Map<string, ToolOutputSnapshot>,
): (UIMessage & { actorId: string; createdAt: Date })[] {
	if (toolOutputs.size === 0) return messages;

	return messages.map((message) => {
		if (message.role !== "assistant" || !Array.isArray(message.parts)) {
			return message;
		}

		let changed = false;
		const parts = message.parts.map((part) => {
			if (!isToolUIPart(part)) return part;

			const output = toolOutputs.get(part.toolCallId);
			if (!output) return part;

			changed = true;
			const next = { ...part } as Record<string, unknown>;
			next.state = output.state;

			if (output.state === "output-error") {
				next.errorText = output.errorText;
				delete next.output;
			} else {
				next.output = output.output;
				delete next.errorText;
			}

			return next as typeof part;
		});

		return changed ? { ...message, parts } : message;
	});
}

export function useChat(options: UseChatOptions): UseChatReturn {
	const { sessionId, proxyUrl, getHeaders } = options;

	// --- SessionDB lifecycle (cached, auto-cleanup) ---
	// Session DBs are cached and automatically cleaned up after 1 hour of
	// inactivity. No manual release needed — each access resets the timer.
	const session = useMemo(() => {
		if (!sessionId) return null;
		return getSessionDB({
			sessionId,
			baseUrl: `${proxyUrl}/api/chat`,
			headers: getHeaders?.(),
		});
	}, [sessionId, proxyUrl, getHeaders]);

	// For cached (already-preloaded) sessions, start ready immediately so
	// messages render on the very first frame — no "Connecting…" flash.
	const [ready, setReady] = useState(session?.preloaded ?? false);

	useEffect(() => {
		if (!session || !sessionId) {
			setReady(false);
			return;
		}
		if (session.preloaded) {
			setReady(true);
			return;
		}
		setReady(false);
		let cancelled = false;
		session.preloadPromise
			.then(() => {
				if (!cancelled) setReady(true);
			})
			.catch((err) => console.error("[useChat] preload failed:", err));
		return () => {
			cancelled = true;
		};
	}, [sessionId, session]);

	// --- URL + headers helpers ---
	const headers = useCallback(
		() => ({
			"Content-Type": "application/json",
			...(getHeaders?.() ?? {}),
		}),
		[getHeaders],
	);

	const url = useCallback(
		(path: string) => `${proxyUrl}/api/chat/${sessionId}/stream${path}`,
		[proxyUrl, sessionId],
	);

	// --- Messages via collection pipeline (null-safe) ---
	const rows = useCollectionData(session?.messagesCollection ?? null);
	const chunks = useCollectionData(session?.db.collections.chunks ?? null);
	const chunkRows = chunks as ChunkRow[];

	const [dismissedIncompleteMessageIds, setDismissedIncompleteMessageIds] =
		useState<string[]>([]);

	// Hide orphaned partial assistant rows after recovery/retry.
	// Valid in-progress assistant output is expected to be the latest row and fresh.
	const visibleRows = (() => {
		const now = Date.now();
		const dismissed = new Set(dismissedIncompleteMessageIds);
		return rows.filter((row, index) => {
			if (row.role !== "assistant" || row.isComplete) return true;
			if (dismissed.has(row.id)) return false;
			const isLatest = index === rows.length - 1;
			const isStale = now - row.lastChunkAt.getTime() >= STALE_THRESHOLD_MS;
			if (isStale) return false;
			return isLatest;
		});
	})();

	const toolOutputs = useMemo(() => parseToolOutputs(chunkRows), [chunkRows]);

	const messages = useMemo(
		() => applyToolOutputs(visibleRows.map(messageRowToUIMessage), toolOutputs),
		[visibleRows, toolOutputs],
	);

	// --- Staleness-aware isLoading ---
	// Tick forces re-evaluation so time-based staleness actually triggers.
	const [_tick, setTick] = useState(0);
	useEffect(() => {
		if (!visibleRows.some((r) => !r.isComplete)) return;
		const timer = setInterval(() => setTick((t) => t + 1), 5_000);
		return () => clearInterval(timer);
	}, [visibleRows]);

	const isLoading = visibleRows.some((row) => {
		const now = Date.now();
		return (
			!row.isComplete && now - row.lastChunkAt.getTime() < STALE_THRESHOLD_MS
		);
	});

	// --- Metadata (title, config, presence, agents) — null-safe ---
	const metadata = useChatMetadata({
		sessionDB: session?.db ?? null,
		proxyUrl,
		sessionId,
		getHeaders,
	});

	// --- Error state ---
	const [error, setError] = useState<string | null>(null);

	// --- Optimistic sendMessage action ---
	// Stable ref to avoid recreating the optimistic action on every render.
	const depsRef = useRef({ url, headers, sessionDB: session?.db, setError });
	depsRef.current = { url, headers, sessionDB: session?.db, setError };

	const optimisticSend = useMemo(
		() =>
			createOptimisticAction<{
				text: string;
				files?: FileUIPart[];
				metadata?: MessageMetadata;
				messageId: string;
				txid: string;
				signal?: AbortSignal;
			}>({
				onMutate: ({ text, files, metadata, messageId }) => {
					const { sessionDB } = depsRef.current;
					if (!sessionDB) return;
					const now = new Date().toISOString();
					const parts: ({ type: "text"; text: string } | FileUIPart)[] = [];
					if (text) parts.push({ type: "text", text });
					if (files) parts.push(...files);
					const chunk: ChunkRow = {
						id: `${messageId}:0`,
						messageId,
						actorId: "user",
						role: "user",
						chunk: JSON.stringify({
							type: "whole-message",
							message: {
								id: messageId,
								role: "user",
								parts,
								createdAt: now,
							},
							...(metadata ? { metadata } : {}),
						}),
						seq: 0,
						createdAt: now,
					};
					sessionDB.collections.chunks.insert(chunk);
				},
				mutationFn: async ({
					text,
					files,
					metadata,
					messageId,
					txid,
					signal,
				}) => {
					const { url, headers, sessionDB } = depsRef.current;
					const res = await fetch(url("/messages"), {
						method: "POST",
						signal,
						headers: headers(),
						body: JSON.stringify({
							content: text || undefined,
							messageId,
							txid,
							...(files && files.length > 0 ? { files } : {}),
							...(metadata ? { metadata } : {}),
						}),
					});
					if (!res.ok) {
						throw new Error(`Failed to send message: ${res.status}`);
					}
					// Wait for the write to sync back through SSE
					await sessionDB?.utils.awaitTxId(txid, 10_000);
				},
			}),
		[],
	);

	const sendMessage = useCallback(
		async (
			text: string,
			files?: FileUIPart[],
			metadata?: MessageMetadata,
			options?: SendMessageOptions,
		) => {
			if (!sessionId) return;
			setError(null);
			if (options?.signal?.aborted) return;
			const messageId = options?.messageId ?? crypto.randomUUID();
			const txid = options?.txid ?? crypto.randomUUID();
			try {
				const tx = optimisticSend({
					text,
					files,
					metadata,
					messageId,
					txid,
					signal: options?.signal,
				});
				await tx.isPersisted.promise;
			} catch (err) {
				if (err instanceof Error && err.name === "AbortError") return;
				setError(err instanceof Error ? err.message : "Failed to send message");
			}
		},
		[optimisticSend, sessionId],
	);

	const stop = useCallback(() => {
		if (!sessionId) return;

		const incompleteAssistantIds = rows
			.filter((row) => row.role === "assistant" && !row.isComplete)
			.map((row) => row.id);
		if (incompleteAssistantIds.length > 0) {
			setDismissedIncompleteMessageIds((prev) =>
				Array.from(new Set([...prev, ...incompleteAssistantIds])),
			);
		}

		fetch(url("/control"), {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ action: "abort" }),
		}).catch(console.error);
	}, [url, headers, sessionId, rows]);

	const addToolOutput = useCallback(
		async (options: AddToolOutputOptions) => {
			if (!sessionId) return;
			setError(null);
			try {
				const res = await fetch(url("/tool-outputs"), {
					method: "POST",
					headers: headers(),
					body: JSON.stringify(options),
				});
				if (!res.ok) {
					throw new Error(`Failed to submit tool output: ${res.status}`);
				}
			} catch (e) {
				const message =
					e instanceof Error ? e.message : "Failed to submit tool output";
				setError(message);
				throw e instanceof Error ? e : new Error(message);
			}
		},
		[url, headers, sessionId],
	);

	const submitApproval = useCallback(
		async (approvalId: string, approved: boolean, toolCallId?: string) => {
			if (!sessionId) return;
			setError(null);
			try {
				const res = await fetch(url(`/approvals/${approvalId}`), {
					method: "POST",
					headers: headers(),
					body: JSON.stringify({
						approved,
						...(toolCallId ? { toolCallId } : {}),
					}),
				});
				if (!res.ok) {
					setError(`Failed to submit approval: ${res.status}`);
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to submit approval");
			}
		},
		[url, headers, sessionId],
	);

	return {
		ready,
		messages,
		isLoading,
		sendMessage,
		stop,
		addToolOutput,
		submitApproval,
		error,
		metadata,
	};
}

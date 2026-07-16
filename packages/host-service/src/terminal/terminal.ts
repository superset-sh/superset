import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { NodeWebSocket } from "@hono/node-ws";
import { hasRunningForegroundProcess } from "@superset/pty-daemon/process-tree";
import { CORRELATED_INPUT_ACK_CAPABILITY } from "@superset/pty-daemon/protocol";
import {
	createScanState,
	SHELLS_WITH_READY_MARKER,
	type ShellReadyScanState,
	scanForShellReady,
} from "@superset/shared/shell-ready-scanner";
import {
	createTerminalTitleScanState,
	scanForTerminalTitle,
	type TerminalTitleScanState,
} from "@superset/shared/terminal-title-scanner";
import { and, eq, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { isProcessAlive, readPtyDaemonManifest } from "../daemon/manifest.ts";
import type { HostDb } from "../db/index.ts";
import { projects, terminalSessions, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import { portManager } from "../ports/port-manager.ts";
import {
	type DaemonClient,
	DaemonInputError,
	type Signal as DaemonSignal,
	type ReplayBoundary,
	type SubscribeCallbacks,
} from "./DaemonClient/index.ts";
import {
	type DaemonPlannedRotationBinding,
	getDaemonClient,
	markDaemonMutationNeedsBarrier,
	onDaemonDisconnect,
	onDaemonPlannedRotation,
	runCurrentDaemonMutation,
} from "./daemon-client-singleton.ts";
import { DaemonMutationQueueOverflowError } from "./daemon-mutation-gate.ts";
import {
	buildV2TerminalEnv,
	getShellLaunchArgs,
	getTerminalBaseEnv,
	resolveLaunchShell,
} from "./env.ts";
import { listTerminalResourceSessions } from "./resource-sessions.ts";
import {
	createModeTracker,
	type ModeTracker,
} from "./terminal-mode-tracker.ts";

/**
 * Thin adapter exposing approximately the IPty surface that the rest of
 * this file (and teardown.ts) was built against, so most of the call
 * sites stay unchanged after the daemon extraction. The PTY itself lives
 * in pty-daemon; this adapter forwards to it over the daemon socket.
 *
 * onData / onExit register additional subscribers on top of whatever the
 * session's primary subscription is doing — daemon supports multi-
 * subscriber fan-out per session, so layered observers work fine.
 */
interface PtyDataDisposer {
	dispose(): void;
}

interface DaemonPtyReplaySubscription extends PtyDataDisposer {
	boundary: Promise<ReplayBoundary>;
}

export interface DaemonPty {
	pid: number;
	write(data: string): Promise<TerminalInputAcceptance>;
	resize(cols: number, rows: number): Promise<void>;
	kill(signal?: NodeJS.Signals): Promise<void>;
	subscribe(
		opts: { replay: boolean },
		callbacks: SubscribeCallbacks,
	): PtyDataDisposer;
	subscribeWithReplayBoundary(
		opts: { replay: boolean },
		callbacks: SubscribeCallbacks,
	): DaemonPtyReplaySubscription;
	stageDaemonRebind(
		daemon: DaemonClient,
	): Promise<DaemonPlannedRotationBinding>;
	disposeSubscriptions(): void;
	onData(cb: (data: string) => void): PtyDataDisposer;
	onExit(
		cb: (info: { exitCode: number; signal: number }) => void,
	): PtyDataDisposer;
}

export type TerminalInputAcceptance = "accepted" | "sent-unconfirmed";

export type InitialCommandDeliveryStatus =
	| TerminalInputAcceptance
	| "pending"
	| "rejected"
	| "outcome-unknown"
	| "already-queued";

export interface InitialCommandDeliveryResult {
	status: InitialCommandDeliveryStatus;
	warning?: string;
}

function makeDaemonPty(
	daemon: DaemonClient,
	sessionId: string,
	pid: number,
): DaemonPty {
	interface SubscriptionEntry {
		callbacks: SubscribeCallbacks;
		disposed: boolean;
	}
	type StagedEvent =
		| { type: "output"; chunk: Buffer }
		| { type: "exit"; info: Parameters<SubscribeCallbacks["onExit"]>[0] };
	type StagedOutputEvent = Extract<StagedEvent, { type: "output" }>;
	interface RotationBaseline {
		/** Raw candidate stream through the last received byte, for legacy retry overlap. */
		replay: Buffer;
		/** Absolute end of that raw stream when cursor-aware ACKs are available. */
		endBytes: number | null;
		/** Output bytes not yet published to host observers across a candidate retry. */
		pendingOutput: StagedOutputEvent[];
	}
	interface PendingObservedBoundary {
		receivedBytes: number;
	}

	let currentDaemon = daemon;
	const subscriptions = new Set<SubscriptionEntry>();
	let rotationBaseline: RotationBaseline | undefined;
	let observedEndBytes: number | null = null;
	let observedCursorError: Error | null = null;
	let observedBoundaryReady: Promise<void> = Promise.resolve();
	let pendingObservedBoundary: PendingObservedBoundary | null = null;
	let aggregateBoundary: Promise<ReplayBoundary> | null = null;
	let aggregateUnsubscribe: (() => void) | null = null;
	let aggregateEpoch = 0;
	let exitPublished = false;
	const MAX_ROTATION_STAGING_BYTES = 8 * 1024 * 1024;

	const addCursorBytes = (
		cursor: number,
		byteCount: number,
		label: string,
	): number => {
		const next = cursor + byteCount;
		if (!Number.isSafeInteger(next) || next < cursor) {
			throw new Error(
				`terminal ${sessionId} ${label} cursor overflow (${cursor} + ${byteCount})`,
			);
		}
		return next;
	};

	const failObservedCursor = (error: unknown): Error => {
		const normalized =
			error instanceof Error ? error : new Error(String(error));
		observedEndBytes = null;
		observedCursorError = normalized;
		return normalized;
	};

	const recordObservedOutput = (chunk: Buffer): void => {
		try {
			if (pendingObservedBoundary) {
				pendingObservedBoundary.receivedBytes = addCursorBytes(
					pendingObservedBoundary.receivedBytes,
					chunk.byteLength,
					"pre-boundary",
				);
			} else if (observedEndBytes !== null) {
				observedEndBytes = addCursorBytes(
					observedEndBytes,
					chunk.byteLength,
					"observed",
				);
			}
		} catch (error) {
			failObservedCursor(error);
		}
	};

	const publishEvent = (event: StagedEvent): void => {
		if (event.type === "exit") {
			if (exitPublished) return;
			exitPublished = true;
		}
		for (const entry of subscriptions) dispatchEvent(entry, event);
	};

	const publishAggregateEvent = (event: StagedEvent): void => {
		if (event.type === "output") recordObservedOutput(event.chunk);
		publishEvent(event);
	};

	const trackObservedBoundary = (
		boundary: Promise<ReplayBoundary>,
		tracker: PendingObservedBoundary,
		epoch: number,
	): Promise<ReplayBoundary> => {
		const tracked = boundary.then(
			(value) => {
				if (pendingObservedBoundary !== tracker || aggregateEpoch !== epoch) {
					return value;
				}
				try {
					pendingObservedBoundary = null;
					if (
						value.replayBytes === null ||
						value.replayStartBytes == null ||
						value.replayEndBytes == null
					) {
						observedEndBytes = null;
						return value;
					}
					if (tracker.receivedBytes < value.replayBytes) {
						throw new Error(
							`terminal ${sessionId} observed ${tracker.receivedBytes} byte(s) before a ${value.replayBytes}-byte initial replay boundary`,
						);
					}
					const liveBytesAfterReplay =
						tracker.receivedBytes - value.replayBytes;
					observedEndBytes = addCursorBytes(
						value.replayEndBytes,
						liveBytesAfterReplay,
						"initial observed",
					);
					observedCursorError = null;
				} catch (error) {
					throw failObservedCursor(error);
				}
				return value;
			},
			(error) => {
				if (pendingObservedBoundary === tracker) {
					pendingObservedBoundary = null;
					failObservedCursor(error);
				}
				throw error;
			},
		);
		observedBoundaryReady = tracked.then(
			() => {},
			() => {},
		);
		return tracked;
	};

	const bindAggregateSubscription = (
		replay: boolean,
	): Promise<ReplayBoundary> => {
		if (aggregateUnsubscribe) {
			throw new Error(
				`terminal ${sessionId} already owns an aggregate daemon subscription`,
			);
		}
		const epoch = ++aggregateEpoch;
		observedEndBytes = null;
		observedCursorError = null;
		const tracker: PendingObservedBoundary = { receivedBytes: 0 };
		pendingObservedBoundary = tracker;
		const subscription = currentDaemon.subscribeWithReplayBoundary(
			sessionId,
			{ replay },
			{
				onOutput: (chunk) => {
					if (aggregateEpoch !== epoch) return;
					publishAggregateEvent({
						type: "output",
						chunk: Buffer.from(chunk),
					});
				},
				onExit: (info) => {
					if (aggregateEpoch !== epoch) return;
					publishAggregateEvent({ type: "exit", info: { ...info } });
				},
			},
		);
		aggregateUnsubscribe = subscription.unsubscribe;
		aggregateBoundary = trackObservedBoundary(
			subscription.boundary,
			tracker,
			epoch,
		);
		return aggregateBoundary;
	};

	const existingAggregateBoundary = async (): Promise<ReplayBoundary> => {
		await observedBoundaryReady;
		if (observedCursorError) throw observedCursorError;
		return {
			replayBytes: 0,
			replayStartBytes: observedEndBytes,
			replayEndBytes: observedEndBytes,
		};
	};

	const ensureAggregateSubscription = (
		replay: boolean,
	): Promise<ReplayBoundary> => {
		if (!aggregateUnsubscribe) return bindAggregateSubscription(replay);
		if (replay) {
			throw new Error(
				`terminal ${sessionId}: replay is not available after the aggregate daemon subscription has started`,
			);
		}
		return existingAggregateBoundary();
	};

	const disposeEntry = (entry: SubscriptionEntry): void => {
		if (entry.disposed) return;
		entry.disposed = true;
		subscriptions.delete(entry);
	};

	const createEntry = (callbacks: SubscribeCallbacks): SubscriptionEntry => {
		const entry: SubscriptionEntry = {
			callbacks,
			disposed: false,
		};
		subscriptions.add(entry);
		return entry;
	};

	const subscribe = (
		opts: { replay: boolean },
		callbacks: SubscribeCallbacks,
	): PtyDataDisposer => {
		const entry = createEntry(callbacks);
		try {
			// This legacy shape cannot surface the async replay boundary. Keep its
			// rejection observed; the cursor error remains recorded for a later
			// rotation to fail closed.
			void ensureAggregateSubscription(opts.replay).catch(() => {});
		} catch (error) {
			disposeEntry(entry);
			throw error;
		}
		return {
			dispose: () => disposeEntry(entry),
		};
	};

	const subscribeWithReplayBoundary = (
		opts: { replay: boolean },
		callbacks: SubscribeCallbacks,
	): DaemonPtyReplaySubscription => {
		const entry = createEntry(callbacks);
		try {
			const boundary = ensureAggregateSubscription(opts.replay);
			return {
				dispose: () => disposeEntry(entry),
				boundary,
			};
		} catch (error) {
			disposeEntry(entry);
			throw error;
		}
	};

	const trimOutputPrefix = (events: StagedEvent[], byteCount: number): void => {
		let remaining = byteCount;
		for (let index = 0; index < events.length && remaining > 0; ) {
			const event = events[index];
			if (!event || event.type !== "output") {
				index += 1;
				continue;
			}
			if (event.chunk.byteLength <= remaining) {
				remaining -= event.chunk.byteLength;
				events.splice(index, 1);
				continue;
			}
			event.chunk = event.chunk.subarray(remaining);
			remaining = 0;
		}
		if (remaining > 0) {
			throw new Error(
				`terminal ${sessionId} replay boundary exceeded staged output by ${remaining} byte(s)`,
			);
		}
	};

	const legacyReplayOverlap = (baseline: Buffer, replay: Buffer): number => {
		const max = Math.min(baseline.byteLength, replay.byteLength);
		for (let length = max; length > 0; length--) {
			if (
				baseline
					.subarray(baseline.byteLength - length)
					.equals(replay.subarray(0, length))
			) {
				return length;
			}
		}
		return 0;
	};

	const dispatchEvent = (
		entry: SubscriptionEntry,
		event: StagedEvent,
	): void => {
		if (entry.disposed) return;
		try {
			if (event.type === "output") entry.callbacks.onOutput(event.chunk);
			else entry.callbacks.onExit(event.info);
		} catch (error) {
			console.error(
				`[terminal] daemon subscriber for ${sessionId} threw during rotation:`,
				error,
			);
		}
	};

	const cloneStagedEvent = (event: StagedEvent): StagedEvent =>
		event.type === "output"
			? { type: "output", chunk: Buffer.from(event.chunk) }
			: { type: "exit", info: { ...event.info } };

	const stageDaemonRebind = async (
		nextDaemon: DaemonClient,
	): Promise<DaemonPlannedRotationBinding> => {
		if (nextDaemon === currentDaemon) {
			return {
				validate: () => {},
				commit: () => {},
				discard: () => {},
			};
		}
		await observedBoundaryReady;
		if (observedCursorError) throw observedCursorError;

		const retryBaseline = rotationBaseline;
		const carriedEvents =
			retryBaseline?.pendingOutput.map(cloneStagedEvent) ?? [];
		const carriedOutputBytes = carriedEvents.reduce(
			(total, event) =>
				event.type === "output" ? total + event.chunk.byteLength : total,
			0,
		);
		const stagedEvents: StagedEvent[] = [];
		let stagedOutputBytes = 0;
		const rawCandidateOutput: Buffer[] = [];
		let rawCandidateOutputBytes = 0;
		let stagingError: Error | null = null;
		let committed = false;
		let discarded = false;
		let candidateUnsubscribe: (() => void) | null = null;
		let boundary: ReplayBoundary | null = null;
		let candidateReplayBytes: number | null = null;
		let legacySkipBytes: number | null = null;
		let appliedSkipBytes = 0;
		let candidateEpoch: number | null = null;

		const candidateStreamEndBytes = (): number | null => {
			if (candidateReplayBytes === null || boundary?.replayEndBytes == null) {
				return null;
			}
			const liveBytesAfterReplay =
				rawCandidateOutputBytes - candidateReplayBytes;
			if (liveBytesAfterReplay < 0) {
				throw new Error(
					`terminal ${sessionId} received ${rawCandidateOutputBytes} candidate byte(s) before a ${candidateReplayBytes}-byte replay boundary`,
				);
			}
			return addCursorBytes(
				boundary.replayEndBytes,
				liveBytesAfterReplay,
				"candidate stream",
			);
		};

		const stageEvent = (event: StagedEvent): void => {
			if (discarded) return;
			if (committed) {
				if (candidateEpoch === null || aggregateEpoch !== candidateEpoch)
					return;
				publishAggregateEvent(event);
				return;
			}
			stagedEvents.push(event);
			if (event.type === "output") {
				rawCandidateOutput.push(event.chunk);
				rawCandidateOutputBytes += event.chunk.byteLength;
				stagedOutputBytes += event.chunk.byteLength;
				if (
					carriedOutputBytes + stagedOutputBytes >
					MAX_ROTATION_STAGING_BYTES
				) {
					stagingError = new Error(
						`terminal ${sessionId} produced more than ${MAX_ROTATION_STAGING_BYTES} staged byte(s) during daemon rotation`,
					);
				}
			}
		};

		try {
			const candidate = nextDaemon.subscribeWithReplayBoundary(
				sessionId,
				{ replay: true },
				{
					onOutput: (chunk) =>
						stageEvent({ type: "output", chunk: Buffer.from(chunk) }),
					onExit: (info) => stageEvent({ type: "exit", info: { ...info } }),
				},
			);
			candidateUnsubscribe = candidate.unsubscribe;
			boundary = await candidate.boundary;
		} catch (error) {
			stagingError = error instanceof Error ? error : new Error(String(error));
		}

		if (boundary) {
			const replayBytes = boundary.replayBytes ?? stagedOutputBytes;
			candidateReplayBytes = replayBytes;
			if (replayBytes > stagedOutputBytes) {
				stagingError = new Error(
					`terminal ${sessionId} received ${stagedOutputBytes} staged byte(s) before a ${replayBytes}-byte replay boundary`,
				);
			}
			const replay = Buffer.concat(rawCandidateOutput).subarray(0, replayBytes);
			if (retryBaseline && retryBaseline.endBytes === null) {
				// Compatibility only. New daemons expose absolute cursors; older ACKs
				// can still recover the common append-only case by matching the exact
				// prior candidate suffix against the replacement replay prefix.
				legacySkipBytes = legacyReplayOverlap(retryBaseline.replay, replay);
			}
		}

		const targetSkipBytes = (): number => {
			if (stagingError) throw stagingError;
			if (!boundary || candidateReplayBytes === null) {
				throw new Error(
					`terminal ${sessionId} did not receive a successor replay boundary`,
				);
			}

			const replayStartBytes = boundary.replayStartBytes;
			const absoluteCut = retryBaseline
				? retryBaseline.endBytes
				: observedEndBytes;
			if (absoluteCut !== null && replayStartBytes != null) {
				const streamEndBytes = candidateStreamEndBytes();
				const skipBytes = absoluteCut - replayStartBytes;
				if (
					streamEndBytes === null ||
					skipBytes < 0 ||
					skipBytes > rawCandidateOutputBytes ||
					absoluteCut > streamEndBytes
				) {
					if (retryBaseline) {
						throw new Error(
							`terminal ${sessionId} lost its daemon replay cut (${absoluteCut} not within ${replayStartBytes}..${streamEndBytes ?? "unknown"})`,
						);
					}
					throw new Error(
						`terminal ${sessionId} host-observed cursor ${absoluteCut} is outside successor replay/stream ${replayStartBytes}..${streamEndBytes ?? "unknown"}`,
					);
				}
				return skipBytes;
			}

			if (retryBaseline && legacySkipBytes !== null) return legacySkipBytes;
			throw new Error(
				`terminal ${sessionId} cannot prove an absolute host-observed replay cursor`,
			);
		};

		const reconcileStagedEvents = (): void => {
			const target = targetSkipBytes();
			if (target < appliedSkipBytes) {
				throw new Error(
					`terminal ${sessionId} host-observed cursor moved backwards during daemon rotation (${target} < ${appliedSkipBytes})`,
				);
			}
			const additionalSkipBytes = target - appliedSkipBytes;
			if (additionalSkipBytes > 0) {
				trimOutputPrefix(stagedEvents, additionalSkipBytes);
				stagedOutputBytes -= additionalSkipBytes;
				appliedSkipBytes = target;
			}
			candidateStreamEndBytes();
		};

		const validate = (): void => reconcileStagedEvents();

		return {
			validate,
			commit() {
				validate();
				const committedEndBytes = candidateStreamEndBytes();
				const predecessorUnsubscribe = aggregateUnsubscribe;
				candidateEpoch = ++aggregateEpoch;
				currentDaemon = nextDaemon;
				committed = true;
				aggregateUnsubscribe = candidateUnsubscribe;
				candidateUnsubscribe = null;
				aggregateBoundary = Promise.resolve(
					boundary ?? {
						replayBytes: candidateReplayBytes,
						replayStartBytes: committedEndBytes,
						replayEndBytes: committedEndBytes,
					},
				);
				observedBoundaryReady = Promise.resolve();
				pendingObservedBoundary = null;
				observedCursorError = null;
				observedEndBytes = committedEndBytes;
				if (predecessorUnsubscribe) {
					try {
						predecessorUnsubscribe();
					} catch {
						// Expected when the predecessor socket has already closed.
					}
				}
				rotationBaseline = undefined;
				for (const event of [
					...carriedEvents.splice(0),
					...stagedEvents.splice(0),
				]) {
					publishEvent(event);
				}
			},
			discard({ final }) {
				if (committed) return;
				discarded = true;
				if (candidateUnsubscribe) {
					const unsubscribe = candidateUnsubscribe;
					candidateUnsubscribe = null;
					try {
						unsubscribe();
					} catch {
						// The candidate transport may already be closed.
					}
				}
				if (final) {
					rotationBaseline = undefined;
				} else if (boundary && candidateReplayBytes !== null) {
					try {
						reconcileStagedEvents();
						rotationBaseline = {
							replay: Buffer.concat(rawCandidateOutput),
							endBytes: candidateStreamEndBytes(),
							// A replacement subscription deterministically re-emits terminal
							// events. Carry only unpublished output or exit would be delivered
							// once from the discarded candidate and once from its retry.
							pendingOutput: [...carriedEvents, ...stagedEvents]
								.filter(
									(event): event is StagedOutputEvent =>
										event.type === "output",
								)
								.map((event) => ({
									type: "output",
									chunk: Buffer.from(event.chunk),
								})),
						};
					} catch (error) {
						stagingError =
							error instanceof Error ? error : new Error(String(error));
						rotationBaseline = undefined;
					}
				}
				carriedEvents.length = 0;
				stagedEvents.length = 0;
				rawCandidateOutput.length = 0;
			},
		};
	};

	return {
		pid,
		write(data) {
			// Copy before enqueue. The caller may reuse its source storage while a
			// daemon update holds this closure.
			const payload = Buffer.from(data, "utf8");
			return runCurrentDaemonMutation(
				{ kind: "input", byteCost: payload.byteLength },
				async (): Promise<TerminalInputAcceptance> => {
					const current = await getDaemonClient();
					const correlated = current.hasCapability(
						CORRELATED_INPUT_ACK_CAPABILITY,
					);
					const input = current.input(sessionId, payload);
					if (!correlated) {
						markDaemonMutationNeedsBarrier(current);
					}
					await input;
					return correlated ? "accepted" : "sent-unconfirmed";
				},
			);
		},
		resize(cols, rows) {
			const nextCols = cols;
			const nextRows = rows;
			return runCurrentDaemonMutation({ kind: "resize" }, async () => {
				const current = await getDaemonClient();
				current.resize(sessionId, nextCols, nextRows);
				markDaemonMutationNeedsBarrier(current);
			});
		},
		kill(signal) {
			const daemonSignal = toDaemonSignal(signal);
			return runCurrentDaemonMutation({ kind: "close" }, async () => {
				const current = await getDaemonClient();
				await current.close(sessionId, daemonSignal);
			});
		},
		subscribe,
		subscribeWithReplayBoundary,
		stageDaemonRebind,
		disposeSubscriptions() {
			for (const entry of [...subscriptions]) {
				if (entry.disposed) continue;
				disposeEntry(entry);
			}
			subscriptions.clear();
			++aggregateEpoch;
			if (aggregateUnsubscribe) {
				const unsubscribe = aggregateUnsubscribe;
				aggregateUnsubscribe = null;
				try {
					unsubscribe();
				} catch {
					// The transport may already be closed during host shutdown.
				}
			}
			aggregateBoundary = null;
			rotationBaseline = undefined;
			pendingObservedBoundary = null;
			observedEndBytes = null;
			observedCursorError = null;
			observedBoundaryReady = Promise.resolve();
			exitPublished = false;
		},
		onData(cb) {
			// StringDecoder buffers partial UTF-8 sequences across chunks.
			// Without it `chunk.toString("utf8")` per chunk replaces the trailing
			// 1–3 bytes of any codepoint that straddles a boundary with U+FFFD —
			// the same bug we ripped out of the primary data path.
			const decoder = new StringDecoder("utf8");
			return subscribe(
				{ replay: false },
				{
					onOutput: (chunk) => {
						const out = decoder.write(chunk);
						if (out.length > 0) cb(out);
					},
					onExit: () => {},
				},
			);
		},
		onExit(cb) {
			return subscribe(
				{ replay: false },
				{
					onOutput: () => {},
					onExit: ({ code, signal }) =>
						cb({ exitCode: code ?? 0, signal: signal ?? 0 }),
				},
			);
		},
	};
}

/** Test-only constructor for the rebindable daemon subscription adapter. */
export function __makeDaemonPtyForTesting(
	daemon: DaemonClient,
	sessionId: string,
	pid = 1,
): DaemonPty {
	return makeDaemonPty(daemon, sessionId, pid);
}

interface RegisterWorkspaceTerminalRouteOptions {
	app: Hono;
	db: HostDb;
	eventBus: EventBus;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

export function parseThemeType(
	value: string | null | undefined,
): "dark" | "light" | undefined {
	return value === "dark" || value === "light" ? value : undefined;
}

/**
 * Build the host-service tRPC URL for the v2 agent hook. The agent shell
 * script POSTs to this; host-service fans out on the event bus so the
 * renderer (web or electron) can play the finish sound.
 */
function getHostAgentHookUrl(): string {
	const port = process.env.HOST_SERVICE_PORT || process.env.PORT;
	if (!port) return "";
	return `http://127.0.0.1:${port}/trpc/notifications.hook`;
}

type TerminalClientMessage =
	| { type: "input"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "dispose" };

type TerminalReplayKind = "full" | "delta" | "none";

// PTY output bytes travel as binary WebSocket frames — the renderer pipes
// the ArrayBuffer straight into xterm.write(Uint8Array) without any UTF-8
// decoding. Control messages stay JSON. Replay (the buffered prefix sent on
// attach) is a binary frame too; the preceding `attached.replayKind` tells a
// renderer whether those bytes replace restored state or append to it.
type TerminalServerMessage =
	| {
			type: "attached";
			terminalId: string;
			replayKind: TerminalReplayKind;
	  }
	| { type: "error"; message: string }
	| { type: "exit"; exitCode: number; signal: number }
	| { type: "title"; title: string | null };

const MAX_BUFFER_BYTES = 64 * 1024;
// Dim separator delivered ahead of a respawned shell's output so users can
// tell restored scrollback from the fresh session (cf. VS Code's "History
// restored" line).
const SESSION_RESTORED_NOTICE = new TextEncoder().encode(
	"\r\n\x1b[90m─── Session Contents Restored ───\x1b[0m\r\n\r\n",
);
// Cap on a single renderer socket's unflushed WebSocket send buffer. With no
// ACK flow control, a renderer that stops draining (slow paint, pinned main
// thread, dead tab) would let this buffer grow without bound → host OOM (the
// risk #4868 was about). Once a socket blows past this, we drop it; the
// renderer auto-reconnects and replays the bounded tail buffer. Crucially the
// PTY is never paused, so a stalled renderer can't wedge the shell. Matches the
// daemon's own 8 MB outbound socket cap.
const WS_SEND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;
const SOCKET_OPEN = 1;
const SOCKET_CLOSING = 2;
const SOCKET_CLOSED = 3;
const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MIN_TERMINAL_COLS = 20;
const MIN_TERMINAL_ROWS = 5;

// `<ArrayBuffer>` narrowing matches hono/ws's WSContext.send signature.
// `raw` is the underlying `ws` WebSocket (present for node-ws); we read
// `bufferedAmount` off it to bound a slow renderer's send queue.
type TerminalSocket = {
	send: (data: string | Uint8Array<ArrayBuffer>) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
	raw?: { readonly bufferedAmount?: number };
};

// ---------------------------------------------------------------------------
// OSC 133 shell readiness detection (FinalTerm semantic prompt standard).
// Scanner logic lives in @superset/shared/shell-ready-scanner.
// ---------------------------------------------------------------------------

/** Flush partial OSC 133;A prefix bytes the scanner is holding if a full marker never arrives. */
const SHELL_READY_TIMEOUT_MS = 3_000;

/**
 * Shell readiness lifecycle:
 * - `pending`     — shell initialising; scanner active
 * - `ready`       — OSC 133;A detected; scanner off
 * - `timed_out`   — marker never arrived within timeout; scanner off
 * - `unsupported` — shell has no marker (sh, ksh); scanner never started
 */
type ShellReadyState = "pending" | "ready" | "timed_out" | "unsupported";

interface TerminalSession {
	terminalId: string;
	workspaceId: string;
	pty: DaemonPty;
	cols: number;
	rows: number;
	/** Unsubscribe from the daemon's output/exit stream when disposed. */
	unsubscribeDaemon: (() => void) | null;
	sockets: Set<TerminalSocket>;
	/**
	 * Buffered PTY output retained for replay on (re)attach. Bytes, not
	 * strings — keeping this byte-aligned with the wire frees us from the
	 * per-chunk UTF-8 decoding that used to mangle TUIs.
	 */
	buffer: Uint8Array[];
	bufferBytes: number;
	/** Exact daemon snapshot captured during an adopted session's replay ACK. */
	fullReplayBuffer: Uint8Array | null;
	/**
	 * Prevent FIFO eviction only while the daemon replay boundary is in flight.
	 * The boundary is same-socket ordered and normally resolves in one turn.
	 */
	preserveBufferUntilReplayBoundary: boolean;
	/** How the next attach's bytes relate to a renderer-restored snapshot. */
	nextAttachReplayKind: TerminalReplayKind;
	/** Concurrent WebSocket attaches wait until replay classification is known. */
	attachReadyPromise: Promise<void>;
	/**
	 * Deliver SESSION_RESTORED_NOTICE ahead of the next replay. Kept out of
	 * the FIFO so MAX_BUFFER_BYTES eviction can't drop it before a client
	 * attaches. Cleared on first replay.
	 */
	restoredNoticePending: boolean;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	exitSignal: number;
	listed: boolean;
	title: string | null;
	titleScanState: TerminalTitleScanState;
	/**
	 * Bus for lifecycle broadcasts. Kept on the session so dispose (which
	 * unsubscribes daemon callbacks before the pty dies, muting onExit) can
	 * still announce the exit to renderers.
	 */
	eventBus: EventBus | undefined;

	// Shell readiness (OSC 133)
	shellReadyState: ShellReadyState;
	shellReadyResolve: (() => void) | null;
	shellReadyPromise: Promise<void>;
	shellReadyTimeoutId: ReturnType<typeof setTimeout> | null;
	scanState: ShellReadyScanState;
	initialCommandQueued: boolean;
	initialCommandResult: InitialCommandDeliveryResult | null;
	/** Detached mutation failures delivered once to the first real WS attach. */
	pendingMutationErrors: string[];

	/**
	 * Side-channel UTF-8 decoder. portManager.checkOutputForHint takes a
	 * string and does text-pattern matching for "Local: http://…" hints,
	 * so we keep a per-session StringDecoder that buffers partial codepoints
	 * across chunks — separate from the data path, never touching what we
	 * actually broadcast to the renderer.
	 */
	portHintDecoder: StringDecoder;

	/**
	 * Mirrors PTY output through a headless xterm so a reattaching renderer
	 * can be resynced via a mode preamble — covers kitty keyboard, bracketed
	 * paste, focus, mouse, etc. that the FIFO can't restore on its own.
	 */
	modeTracker: ModeTracker;
}

/** PTY lifetime is independent of socket lifetime — sockets detach/reattach freely. */
const sessions = new Map<string, TerminalSession>();
type CreateTerminalSessionResult = TerminalSession | { error: string };
const sessionCreations = new Map<
	string,
	Promise<CreateTerminalSessionResult>
>();

// A successful fd handoff preserves the PTYs, so keep host session objects and
// renderer WebSockets intact. Rebind every primary and auxiliary subscription
// before the mutation gate flushes held input to this successor.
onDaemonPlannedRotation(async (daemon) => {
	const bindings: DaemonPlannedRotationBinding[] = [];
	try {
		for (const session of sessions.values()) {
			bindings.push(await session.pty.stageDaemonRebind(daemon));
		}
	} catch (error) {
		for (const binding of bindings) {
			try {
				binding.discard({ final: true });
			} catch {
				// Best-effort rollback of already-staged sessions.
			}
		}
		throw error;
	}
	return {
		validate() {
			for (const binding of bindings) binding.validate();
		},
		commit() {
			for (const binding of bindings) binding.commit();
		},
		discard(options) {
			for (const binding of bindings) binding.discard(options);
		},
	};
});

// When the daemon disconnects, close every WS socket so the renderer's
// existing exponential-backoff reconnect kicks in. On reconnect, host-service
// rebuilds the DaemonClient (next getDaemonClient() call), and the adoption-
// via-list path re-attaches to live sessions on the respawned daemon. Without
// this, sockets stay open and input/resize silently fail because the daemon
// reference is dead.
//
// We also clear the in-memory sessions map so a stale subscription closure
// doesn't keep firing for sessions that no longer match daemon state.
onDaemonDisconnect((err) => {
	const sessionCount = sessions.size;
	if (sessionCount === 0) return;
	console.warn(
		`[terminal] pty-daemon disconnected (${err?.message ?? "no message"}); closing ${sessionCount} terminal WS socket(s) to trigger renderer reconnect`,
	);
	for (const session of sessions.values()) {
		for (const socket of session.sockets) {
			try {
				socket.close(1011, "pty-daemon disconnected");
			} catch {
				// best-effort
			}
		}
		session.sockets.clear();
		session.pty.disposeSubscriptions();
		session.unsubscribeDaemon = null;
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
	}
	sessions.clear();
});

/**
 * Test-only escape hatch: simulates a host-service process restart by clearing
 * the in-memory session map without touching the daemon. After calling this,
 * createTerminalSessionInternal() is forced down the adoption-on-EEXIST path
 * for any session id the daemon already owns.
 *
 * NEVER call this from production code paths.
 */
export function __resetSessionsForTesting(): void {
	for (const session of sessions.values()) {
		session.pty.disposeSubscriptions();
		session.unsubscribeDaemon = null;
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
	}
	sessions.clear();
}

/**
 * Whether a terminal id has a live in-memory session on this host-service
 * process. Such sessions already drive their own port scanning and unregister
 * themselves via the daemon exit subscription, so the port-scan sync must leave
 * them alone. Returns false for sessions the daemon still owns but that this
 * process hasn't re-created since its last restart.
 */
export function isLiveTerminalSession(terminalId: string): boolean {
	const session = sessions.get(terminalId);
	return session !== undefined && !session.exited;
}

/**
 * Whether a live session has a foreground command running (vs. sitting at an
 * idle shell prompt). Drives the "close anyway?" confirm on pane close. Unknown
 * sessions, idle prompts, and sessions owned by another workspace return false.
 */
export function sessionHasRunningProcess(
	terminalId: string,
	workspaceId: string,
): boolean {
	const session = sessions.get(terminalId);
	if (!session || session.exited) return false;
	// Ownership gate: don't let one workspace probe another's terminals.
	if (session.workspaceId !== workspaceId) return false;
	return hasRunningForegroundProcess(session.pty.pid);
}

function pruneAndCountOpenSockets(session: TerminalSession): number {
	let openSockets = 0;
	for (const socket of session.sockets) {
		if (socket.readyState === SOCKET_OPEN) {
			openSockets += 1;
		} else if (
			socket.readyState === SOCKET_CLOSING ||
			socket.readyState === SOCKET_CLOSED
		) {
			session.sockets.delete(socket);
		}
	}
	return openSockets;
}

export interface TerminalSessionSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
}

export function listTerminalSessions(
	options: { workspaceId?: string; includeExited?: boolean } = {},
): TerminalSessionSummary[] {
	const includeExited = options.includeExited ?? true;

	return Array.from(sessions.values())
		.filter((session) => session.listed)
		.filter(
			(session) =>
				options.workspaceId === undefined ||
				session.workspaceId === options.workspaceId,
		)
		.filter((session) => includeExited || !session.exited)
		.map((session) => ({
			terminalId: session.terminalId,
			workspaceId: session.workspaceId,
			createdAt: session.createdAt,
			exited: session.exited,
			exitCode: session.exitCode,
			attached: pruneAndCountOpenSockets(session) > 0,
			title: session.title,
		}));
}

export function countTerminalSessions(
	options: {
		workspaceId?: string;
		includeExited?: boolean;
		excludeTerminalIds?: Iterable<string>;
	} = {},
): number {
	const includeExited = options.includeExited ?? true;
	const excludedTerminalIds = options.excludeTerminalIds
		? new Set(options.excludeTerminalIds)
		: null;
	let count = 0;

	for (const session of sessions.values()) {
		if (!session.listed) continue;
		if (
			options.workspaceId !== undefined &&
			session.workspaceId !== options.workspaceId
		) {
			continue;
		}
		if (!includeExited && session.exited) continue;
		if (excludedTerminalIds?.has(session.terminalId)) continue;
		count += 1;
	}

	return count;
}

export async function writeInputToSession({
	terminalId,
	workspaceId,
	data,
}: {
	terminalId: string;
	workspaceId: string;
	data: string;
}): Promise<
	{ success: true } | { error: string; code?: "QUEUE_FULL" | "WRITE_FAILED" }
> {
	const session = sessions.get(terminalId);
	if (!session) {
		return { error: "Terminal session not found" };
	}
	if (session.workspaceId !== workspaceId) {
		return { error: "Terminal session does not belong to this workspace" };
	}
	if (session.exited) {
		return { error: "Terminal session has exited" };
	}

	try {
		await session.pty.write(data);
	} catch (error) {
		return {
			error:
				error instanceof Error
					? error.message
					: "Failed to write terminal input",
			code:
				error instanceof DaemonMutationQueueOverflowError
					? "QUEUE_FULL"
					: "WRITE_FAILED",
		};
	}
	return { success: true };
}

function sendMessage(
	socket: { send: (data: string) => void; readyState: number },
	message: TerminalServerMessage,
) {
	if (socket.readyState !== SOCKET_OPEN) return;
	socket.send(JSON.stringify(message));
}

function broadcastMessage(
	session: TerminalSession,
	message: TerminalServerMessage,
): number {
	let sent = 0;
	for (const socket of session.sockets) {
		if (socket.readyState !== SOCKET_OPEN) {
			if (
				socket.readyState === SOCKET_CLOSING ||
				socket.readyState === SOCKET_CLOSED
			) {
				session.sockets.delete(socket);
			}
			continue;
		}
		sendMessage(socket, message);
		sent += 1;
	}
	return sent;
}

const MAX_PENDING_MUTATION_ERRORS = 32;

function reportSessionMutationMessage(
	session: TerminalSession,
	message: string,
): void {
	console.error(`[terminal] ${message}`, { terminalId: session.terminalId });
	if (broadcastMessage(session, { type: "error", message }) > 0) return;
	session.pendingMutationErrors.push(message);
	if (session.pendingMutationErrors.length > MAX_PENDING_MUTATION_ERRORS) {
		session.pendingMutationErrors.splice(
			0,
			session.pendingMutationErrors.length - MAX_PENDING_MUTATION_ERRORS,
		);
	}
}

function flushPendingMutationErrors(
	session: TerminalSession,
	socket: TerminalSocket,
): void {
	if (socket.readyState !== SOCKET_OPEN) return;
	const pending = session.pendingMutationErrors.splice(0);
	for (const message of pending) {
		sendMessage(socket, { type: "error", message });
	}
}

function setSessionTitle(session: TerminalSession, title: string | null) {
	if (session.title === title) return;
	session.title = title;
	broadcastMessage(session, { type: "title", title });
}

function bufferOutput(session: TerminalSession, data: Uint8Array) {
	session.buffer.push(data);
	session.bufferBytes += data.byteLength;
	if (session.preserveBufferUntilReplayBoundary) return;
	trimBufferedOutput(session);
}

function trimBufferedOutput(session: TerminalSession) {
	while (session.bufferBytes > MAX_BUFFER_BYTES && session.buffer.length > 1) {
		const removed = session.buffer.shift();
		if (removed) session.bufferBytes -= removed.byteLength;
	}
}

/** Remove and return exactly the first `count` bytes from the replay FIFO. */
function takeBufferedPrefix(
	session: TerminalSession,
	count: number,
): Uint8Array {
	const prefix = new Uint8Array(count);
	let copied = 0;
	while (copied < count && session.buffer.length > 0) {
		const head = session.buffer.shift();
		if (!head) break;
		const needed = count - copied;
		const take = Math.min(needed, head.byteLength);
		prefix.set(head.subarray(0, take), copied);
		copied += take;
		session.bufferBytes -= take;
		if (take < head.byteLength) {
			session.buffer.unshift(head.subarray(take));
			break;
		}
	}
	if (copied !== count) {
		throw new Error(
			`daemon replay boundary announced ${count} bytes, but host received ${copied}`,
		);
	}
	return prefix;
}

function normalizeTerminalDimension(
	value: number | null | undefined,
	min: number,
	fallback: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
	return Math.max(min, Math.floor(value));
}

// All bytes we send here are ArrayBuffer-backed at runtime (node Buffers,
// scanner outputs); the cast just narrows the type-system's loose default.
function asArrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return bytes as Uint8Array<ArrayBuffer>;
}

function sendBytes(socket: TerminalSocket, bytes: Uint8Array) {
	if (socket.readyState !== SOCKET_OPEN) return;
	socket.send(asArrayBufferBytes(bytes));
}

function socketBufferedAmount(socket: TerminalSocket): number {
	const amount = socket.raw?.bufferedAmount;
	return typeof amount === "number" ? amount : 0;
}

function broadcastBytes(session: TerminalSession, bytes: Uint8Array): number {
	let sent = 0;
	const tight = asArrayBufferBytes(bytes);
	for (const socket of session.sockets) {
		if (socket.readyState !== SOCKET_OPEN) {
			if (
				socket.readyState === SOCKET_CLOSING ||
				socket.readyState === SOCKET_CLOSED
			) {
				session.sockets.delete(socket);
			}
			continue;
		}
		// A renderer that can't keep up lets its send buffer grow without bound.
		// Drop it past the cap rather than buffer forever; it reconnects and
		// replays the tail. Returning this chunk as "not sent" routes it to the
		// bounded replay buffer via the caller's broadcast-or-buffer check.
		if (socketBufferedAmount(socket) > WS_SEND_BUFFER_CAP_BYTES) {
			session.sockets.delete(socket);
			try {
				socket.close(1013, "terminal output back-pressure");
			} catch {
				// best-effort; close may race an already-closing socket
			}
			continue;
		}
		socket.send(tight);
		sent += 1;
	}
	if (sent > 0 && session.nextAttachReplayKind === "full") {
		session.nextAttachReplayKind = "delta";
	}
	return sent;
}

export function replayBuffer(session: TerminalSession, socket: TerminalSocket) {
	// sendBytes below no-ops on a non-open socket — bail before clearing the
	// buffer/notice so the next attach can still replay them.
	if (socket.readyState !== SOCKET_OPEN) return;
	// Preamble first, then the restored notice, then FIFO. Mode-setting
	// escapes (kitty keyboard, bracketed paste, focus, …) are typically
	// emitted once at startup and broadcast away rather than buffered, so a
	// fresh xterm needs them re-asserted on every attach — even when the
	// FIFO is empty.
	const preamble = session.modeTracker.buildPreamble();
	const notice = session.restoredNoticePending ? SESSION_RESTORED_NOTICE : null;
	const fullReplay = session.fullReplayBuffer;
	let bufferTotal = 0;
	for (const b of session.buffer) bufferTotal += b.byteLength;
	const preambleLen = preamble?.byteLength ?? 0;
	const noticeLen = notice?.byteLength ?? 0;
	const fullReplayLen = fullReplay?.byteLength ?? 0;
	if (
		preambleLen === 0 &&
		noticeLen === 0 &&
		fullReplayLen === 0 &&
		bufferTotal === 0
	) {
		return;
	}

	const combined = new Uint8Array(
		preambleLen + noticeLen + fullReplayLen + bufferTotal,
	);
	let offset = 0;
	if (preamble) {
		combined.set(preamble, offset);
		offset += preamble.byteLength;
	}
	if (notice) {
		combined.set(notice, offset);
		offset += notice.byteLength;
	}
	if (fullReplay) {
		combined.set(fullReplay, offset);
		offset += fullReplay.byteLength;
	}
	for (const b of session.buffer) {
		combined.set(b, offset);
		offset += b.byteLength;
	}
	session.restoredNoticePending = false;
	session.fullReplayBuffer = null;
	session.buffer.length = 0;
	session.bufferBytes = 0;
	sendBytes(socket, combined);
	if (session.nextAttachReplayKind === "full") {
		session.nextAttachReplayKind = "delta";
	}
}

/**
 * Transition out of `pending`. Flushes any partially-matched marker
 * bytes as terminal output (they weren't a real marker). Idempotent.
 */
function resolveShellReady(
	session: TerminalSession,
	state: "ready" | "timed_out",
): void {
	if (session.shellReadyState !== "pending") return;
	session.shellReadyState = state;
	if (session.shellReadyTimeoutId) {
		clearTimeout(session.shellReadyTimeoutId);
		session.shellReadyTimeoutId = null;
	}
	// Flush held marker bytes — they weren't part of a full marker
	if (session.scanState.heldBytes.length > 0) {
		const heldBytes = Uint8Array.from(session.scanState.heldBytes);
		session.modeTracker.feed(heldBytes);
		bufferOutput(session, heldBytes);
		session.scanState.heldBytes.length = 0;
	}
	session.scanState.matchPos = 0;
	if (session.shellReadyResolve) {
		session.shellReadyResolve();
		session.shellReadyResolve = null;
	}
}

function queueInitialCommand(
	session: TerminalSession,
	initialCommand: string,
	directDaemon?: DaemonClient,
): Promise<InitialCommandDeliveryResult> {
	const cmd = initialCommand.endsWith("\n")
		? initialCommand
		: `${initialCommand}\n`;
	return runInitialCommandAttempt(
		session,
		() => {
			// Don't gate on OSC 133;A: PTY stdin buffers until the shell reads it,
			// and gating turned broken/missing markers into a guaranteed stall.
			if (!directDaemon) return session.pty.write(cmd);
			// createTerminalSessionInternalDirect already owns a mutation lease, so
			// nesting another gated operation could deadlock if an update starts
			// between the open and this initial write. The outer lease owns this ACK.
			return sendDirectDaemonInput(
				directDaemon,
				session.terminalId,
				Buffer.from(cmd, "utf8"),
			);
		},
		(message) => reportSessionMutationMessage(session, message),
	);
}

function runInitialCommandAttempt(
	state: {
		initialCommandQueued: boolean;
		exited: boolean;
		initialCommandResult?: InitialCommandDeliveryResult | null;
	},
	send: () => Promise<TerminalInputAcceptance>,
	onVisibleError: (message: string) => void,
): Promise<InitialCommandDeliveryResult> {
	if (state.initialCommandQueued || state.exited) {
		const result = state.initialCommandResult ?? {
			status: "already-queued" as const,
			warning: state.exited
				? "Initial command was not sent because the terminal has exited."
				: "Initial command was not sent because this session already attempted one.",
		};
		state.initialCommandResult = result;
		return Promise.resolve(result);
	}
	state.initialCommandQueued = true;
	state.initialCommandResult = { status: "pending" };
	let operation: Promise<TerminalInputAcceptance>;
	try {
		operation = send();
	} catch (error) {
		operation = Promise.reject(error);
	}
	return operation.then(
		(status) => {
			const result: InitialCommandDeliveryResult =
				status === "accepted"
					? { status }
					: {
							status,
							warning:
								"Initial command was sent to a legacy terminal without correlated acknowledgement.",
						};
			state.initialCommandResult = result;
			return result;
		},
		(error) => {
			const detail = error instanceof Error ? error.message : String(error);
			const definitive =
				error instanceof DaemonInputError &&
				error.outcome === "definitive-reject";
			if (definitive) state.initialCommandQueued = false;
			const result: InitialCommandDeliveryResult = definitive
				? {
						status: "rejected",
						warning: `Initial command was rejected before terminal enqueue: ${detail}`,
					}
				: {
						status: "outcome-unknown",
						warning: `Initial command delivery could not be confirmed and may have run: ${detail}`,
					};
			state.initialCommandResult = result;
			onVisibleError(`Terminal ${result.warning}`);
			return result;
		},
	);
}

function sendDirectDaemonInput(
	daemon: DaemonClient,
	terminalId: string,
	payload: Buffer,
): Promise<TerminalInputAcceptance> {
	const correlated = daemon.hasCapability(CORRELATED_INPUT_ACK_CAPABILITY);
	const input = daemon.input(terminalId, payload);
	if (!correlated) {
		markDaemonMutationNeedsBarrier(daemon);
	}
	return input.then(() => (correlated ? "accepted" : "sent-unconfirmed"));
}

/** Exact direct-initial-command transport path, exposed only for regression tests. */
export const __sendDirectDaemonInputForTesting = sendDirectDaemonInput;

/** Direct initial-command failure semantics, exposed only for regression tests. */
export function __queueDirectInitialCommandForTesting(
	state: {
		initialCommandQueued: boolean;
		exited: boolean;
		initialCommandResult?: InitialCommandDeliveryResult | null;
	},
	daemon: DaemonClient,
	terminalId: string,
	payload: Buffer,
	onVisibleError: (message: string) => void,
): Promise<InitialCommandDeliveryResult> {
	return runInitialCommandAttempt(
		state,
		() => sendDirectDaemonInput(daemon, terminalId, payload),
		onVisibleError,
	);
}

function reportSessionMutationError(
	session: TerminalSession,
	operation: string,
	error: unknown,
): void {
	const detail = error instanceof Error ? error.message : String(error);
	const message = `Terminal ${operation} failed: ${detail}`;
	reportSessionMutationMessage(session, message);
}

interface DaemonCloseResult {
	attempted: boolean;
	succeeded: boolean;
	error?: unknown;
}

export interface DisposeSessionResult {
	terminalId: string;
	daemonCloseAttempted: boolean;
	daemonCloseSucceeded: boolean;
}

function toDaemonSignal(signal?: NodeJS.Signals): DaemonSignal {
	switch (signal) {
		case "SIGINT":
		case "SIGTERM":
		case "SIGKILL":
		case "SIGHUP":
			return signal;
		default:
			return "SIGHUP";
	}
}

function isUnknownDaemonSessionError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.message.includes("unknown session:");
}

function reachableDaemonSocketPath(): string | null {
	const explicitSocket = process.env.SUPERSET_PTY_DAEMON_SOCKET;
	if (explicitSocket) return explicitSocket;

	const organizationId = process.env.ORGANIZATION_ID;
	if (!organizationId) return null;

	const manifest = readPtyDaemonManifest(organizationId);
	if (!manifest || !isProcessAlive(manifest.pid)) return null;
	return manifest.socketPath;
}

async function closeDaemonSessionByIdDirect(
	terminalId: string,
	signal: DaemonSignal = "SIGHUP",
	knownInMemorySession = false,
): Promise<DaemonCloseResult> {
	// Preserve stale-row/reaper semantics: when there is no known live session
	// and no reachable owner, there is nothing to kill and the DB row may be
	// disposed. A known in-memory session still gets a close attempt even if a
	// manifest disappeared between checks.
	if (!knownInMemorySession && !reachableDaemonSocketPath()) {
		return { attempted: false, succeeded: true };
	}
	try {
		// Resolve inside the mutation lease. After a successful handoff this is
		// the successor singleton; after an abort it is still the predecessor.
		const daemon = await getDaemonClient();
		await daemon.close(terminalId, signal);
		return { attempted: true, succeeded: true };
	} catch (error) {
		if (isUnknownDaemonSessionError(error)) {
			return { attempted: true, succeeded: true };
		}
		return { attempted: true, succeeded: false, error };
	}
}

/**
 * Kills the PTY (if live) and marks the DB row disposed. Safe to call even
 * when there's no in-memory session — e.g. for zombie `active` rows left
 * over from a prior crash. Exported so workspaceCleanup can dispose the
 * transient teardown session.
 */
export function disposeSession(terminalId: string, db: HostDb) {
	void disposeSessionAndWait(terminalId, db)
		.then((result) => {
			if (!result.daemonCloseSucceeded) {
				console.warn("[terminal] disposeSession daemon close failed", {
					terminalId,
				});
			}
		})
		.catch((error) => {
			console.warn("[terminal] disposeSession failed", { terminalId, error });
		});
}

async function disposeSessionAndWaitDirect(
	terminalId: string,
	db: HostDb,
): Promise<DisposeSessionResult> {
	const session = sessions.get(terminalId);
	let closePromise: Promise<DaemonCloseResult> | null = null;

	if (session) {
		if (session.shellReadyTimeoutId) {
			clearTimeout(session.shellReadyTimeoutId);
			session.shellReadyTimeoutId = null;
		}
		for (const socket of session.sockets) {
			socket.close(1000, "Session disposed");
		}
		session.sockets.clear();
		if (!session.exited) {
			closePromise = closeDaemonSessionByIdDirect(terminalId, "SIGHUP", true);
		}
		// Stop receiving daemon callbacks for this session.
		session.pty.disposeSubscriptions();
		session.unsubscribeDaemon = null;
		try {
			session.modeTracker.dispose();
		} catch {
			// best-effort
		}
		sessions.delete(terminalId);
	} else {
		closePromise = closeDaemonSessionByIdDirect(terminalId, "SIGHUP");
	}

	portManager.unregisterSession(terminalId);

	const closeResult = closePromise
		? await closePromise
		: { attempted: false, succeeded: true };

	if (closeResult.succeeded) {
		const endedAt = Date.now();
		db.update(terminalSessions)
			.set({ status: "disposed", endedAt })
			.where(eq(terminalSessions.id, terminalId))
			.run();

		// Dispose unsubscribed the daemon callbacks above, so onExit will
		// never fire for this session — announce the exit here (after the
		// row flips to disposed, so refetching readers see it dead). Skip
		// sessions whose pty already exited: onExit broadcast that one.
		if (session && !session.exited) {
			session.eventBus?.broadcastTerminalLifecycle({
				workspaceId: session.workspaceId,
				terminalId,
				eventType: "exit",
				exitCode: 0,
				signal: 0,
				occurredAt: endedAt,
			});
		}
	}

	return {
		terminalId,
		daemonCloseAttempted: closeResult.attempted,
		daemonCloseSucceeded: closeResult.succeeded,
	};
}

export function disposeSessionAndWait(
	terminalId: string,
	db: HostDb,
): Promise<DisposeSessionResult> {
	const copiedTerminalId = `${terminalId}`;
	return runCurrentDaemonMutation(
		{ kind: "dispose", byteCost: Buffer.byteLength(copiedTerminalId) },
		() => disposeSessionAndWaitDirect(copiedTerminalId, db),
	);
}

/**
 * Dispose every active session belonging to the given workspace, then drop the
 * confirmed-dead rows so the workspace's session index dies with it rather than
 * lingering as `set null` orphans. A still-`active` row is a failed kill we keep
 * reachable for the reaper. Returns counts so callers (e.g.
 * workspaceCleanup.destroy) can surface warnings.
 */
export async function disposeSessionsByWorkspaceId(
	workspaceId: string,
	db: HostDb,
): Promise<{ terminated: number; failed: number }> {
	const rows = db
		.select({ id: terminalSessions.id })
		.from(terminalSessions)
		.where(
			and(
				eq(terminalSessions.originWorkspaceId, workspaceId),
				ne(terminalSessions.status, "disposed"),
			),
		)
		.all();

	let terminated = 0;
	let failed = 0;
	for (const row of rows) {
		try {
			const result = await disposeSessionAndWait(row.id, db);
			if (!result.daemonCloseSucceeded) {
				failed += 1;
				continue;
			}
			terminated += 1;
		} catch {
			failed += 1;
		}
	}

	db.delete(terminalSessions)
		.where(
			and(
				eq(terminalSessions.originWorkspaceId, workspaceId),
				ne(terminalSessions.status, "active"),
			),
		)
		.run();

	return { terminated, failed };
}

/**
 * Dispose every active session for any workspace mapped to the given worktree
 * path. Deleting a closed worktree has no workspace id, so we join through the
 * workspaces table on the shared worktree path.
 */
export async function disposeSessionsByWorktreePath(
	worktreePath: string,
	db: HostDb,
): Promise<{ terminated: number; failed: number }> {
	const workspaceRows = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.worktreePath, worktreePath))
		.all();

	let terminated = 0;
	let failed = 0;
	for (const { id } of workspaceRows) {
		const result = await disposeSessionsByWorkspaceId(id, db);
		terminated += result.terminated;
		failed += result.failed;
	}
	return { terminated, failed };
}

interface CreateTerminalSessionOptions {
	terminalId: string;
	workspaceId: string;
	themeType?: "dark" | "light";
	db: HostDb;
	eventBus?: EventBus;
	initialCommand?: string;
	cwd?: string;
	/** Hidden sessions are process-internal and should not appear in user pickers. */
	listed?: boolean;
	cols?: number;
	rows?: number;
	/** Only recover an already-live daemon session; never spawn a new PTY. */
	adoptOnly?: boolean;
	/**
	 * Deliver a "session restored" separator ahead of the first replay. Set on
	 * the cold-restore respawn path, where the renderer paints stale scrollback
	 * above a brand-new shell.
	 */
	restoredNotice?: boolean;
}

function resolveTerminalCwd(
	cwdOverride: string | undefined,
	worktreePath: string,
): string {
	if (!cwdOverride) return worktreePath;
	if (isAbsolute(cwdOverride)) {
		return existsSync(cwdOverride) ? cwdOverride : worktreePath;
	}

	const relativePath = cwdOverride.startsWith("./")
		? cwdOverride.slice(2)
		: cwdOverride;
	const resolvedPath = join(worktreePath, relativePath);
	return existsSync(resolvedPath) ? resolvedPath : worktreePath;
}

function getTerminalWorkspaceMismatchError({
	terminalId,
	ownerWorkspaceId,
	requestedWorkspaceId,
}: {
	terminalId: string;
	ownerWorkspaceId: string | null | undefined;
	requestedWorkspaceId: string;
}): string | null {
	if (!ownerWorkspaceId || ownerWorkspaceId === requestedWorkspaceId) {
		return null;
	}

	return `Terminal session "${terminalId}" belongs to workspace "${ownerWorkspaceId}", not "${requestedWorkspaceId}".`;
}

export function createTerminalSessionInternal(
	options: CreateTerminalSessionOptions,
): Promise<CreateTerminalSessionResult> {
	// Strings/numbers are immutable, but copy the option record itself before
	// enqueue so a caller cannot replace fields while an update is holding it.
	const copiedOptions: CreateTerminalSessionOptions = { ...options };
	const byteCost =
		Buffer.byteLength(copiedOptions.terminalId) +
		Buffer.byteLength(copiedOptions.initialCommand ?? "") +
		Buffer.byteLength(copiedOptions.cwd ?? "");
	return runCurrentDaemonMutation({ kind: "open", byteCost }, () =>
		createTerminalSessionInternalQueued(copiedOptions),
	);
}

async function createTerminalSessionInternalQueued(
	options: CreateTerminalSessionOptions,
): Promise<CreateTerminalSessionResult> {
	const inFlight = sessionCreations.get(options.terminalId);
	if (inFlight) {
		const result = await inFlight;
		if ("error" in result) return result;
		// Re-enter after the first creator finishes so the existing-session path
		// applies this caller's workspace validation, listed flag, and command.
		return createTerminalSessionInternalDirect(options);
	}

	const creation = createTerminalSessionInternalDirect(options);
	sessionCreations.set(options.terminalId, creation);
	try {
		return await creation;
	} finally {
		if (sessionCreations.get(options.terminalId) === creation) {
			sessionCreations.delete(options.terminalId);
		}
	}
}

async function createTerminalSessionInternalDirect({
	terminalId,
	workspaceId,
	themeType,
	db,
	eventBus,
	initialCommand,
	cwd: cwdOverride,
	listed = true,
	cols: requestedCols,
	rows: requestedRows,
	adoptOnly = false,
	restoredNotice = false,
}: CreateTerminalSessionOptions): Promise<CreateTerminalSessionResult> {
	const existing = sessions.get(terminalId);
	if (existing) {
		const mismatchError = getTerminalWorkspaceMismatchError({
			terminalId,
			ownerWorkspaceId: existing.workspaceId,
			requestedWorkspaceId: workspaceId,
		});
		if (mismatchError) return { error: mismatchError };

		try {
			await existing.attachReadyPromise;
		} catch (error) {
			return {
				error:
					error instanceof Error
						? error.message
						: "Failed to attach terminal replay",
			};
		}
		if (listed) existing.listed = true;
		if (initialCommand) void queueInitialCommand(existing, initialCommand);
		return existing;
	}

	const existingRecord = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, terminalId) })
		.sync();
	const recordMismatchError = getTerminalWorkspaceMismatchError({
		terminalId,
		ownerWorkspaceId: existingRecord?.originWorkspaceId,
		requestedWorkspaceId: workspaceId,
	});
	if (recordMismatchError) return { error: recordMismatchError };

	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();

	if (!workspace) {
		return { error: "Workspace not found" };
	}
	if (!existsSync(workspace.worktreePath)) {
		return {
			error: `Workspace worktree no longer exists: ${workspace.worktreePath}`,
		};
	}

	// Derive root path from the workspace's project
	let rootPath = "";
	const project = db.query.projects
		.findFirst({ where: eq(projects.id, workspace.projectId) })
		.sync();
	if (project?.repoPath) {
		rootPath = project.repoPath;
	}

	const cwd = resolveTerminalCwd(cwdOverride, workspace.worktreePath);
	const cols = normalizeTerminalDimension(
		requestedCols,
		MIN_TERMINAL_COLS,
		DEFAULT_TERMINAL_COLS,
	);
	const rows = normalizeTerminalDimension(
		requestedRows,
		MIN_TERMINAL_ROWS,
		DEFAULT_TERMINAL_ROWS,
	);

	// Use the preserved shell snapshot — never live process.env
	const baseEnv = getTerminalBaseEnv();
	const supersetHomeDir = process.env.SUPERSET_HOME_DIR || "";
	const shell = resolveLaunchShell(baseEnv);
	const shellArgs = getShellLaunchArgs({ shell, supersetHomeDir });
	const ptyEnv = buildV2TerminalEnv({
		baseEnv,
		shell,
		supersetHomeDir,
		themeType,
		cwd,
		terminalId,
		workspaceId,
		workspacePath: workspace.worktreePath,
		rootPath,
		supersetEnv:
			process.env.NODE_ENV === "development" ? "development" : "production",
		agentHookPort: process.env.SUPERSET_AGENT_HOOK_PORT || "",
		agentHookVersion: process.env.SUPERSET_AGENT_HOOK_VERSION || "",
		hostAgentHookUrl: getHostAgentHookUrl(),
	});

	let daemon: DaemonClient;
	let openResult: { pid: number };
	let isAdopted = false;
	try {
		daemon = await getDaemonClient();
		if (adoptOnly) {
			const found = (await daemon.list()).find(
				(s) => s.id === terminalId && s.alive,
			);
			if (!found) {
				return {
					error: `Terminal session "${terminalId}" is not active; create it before connecting.`,
				};
			}
			openResult = { pid: found.pid };
			isAdopted = true;
			console.log(
				`[terminal] adopted existing daemon session ${terminalId} pid=${found.pid}`,
			);
		} else {
			try {
				openResult = await daemon.open(terminalId, {
					shell,
					argv: shellArgs,
					cwd,
					cols,
					rows,
					env: ptyEnv,
				});
			} catch (err) {
				// After host-service restart the daemon may already own this
				// session. Adopt it instead of looping forever on "session already
				// exists". The daemon kept the buffer + the live shell; we just
				// need to stitch up a TerminalSession record on this side and
				// subscribe-with-replay below.
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes("session already exists")) {
					const list = await daemon.list();
					const found = list.find((s) => s.id === terminalId && s.alive);
					if (!found) throw err;
					openResult = { pid: found.pid };
					isAdopted = true;
					console.log(
						`[terminal] adopted existing daemon session ${terminalId} pid=${found.pid}`,
					);
				} else {
					throw err;
				}
			}
		}
	} catch (error) {
		return {
			error:
				error instanceof Error ? error.message : "Failed to start terminal",
		};
	}
	const pty: DaemonPty = makeDaemonPty(daemon, terminalId, openResult.pid);

	const createdAt = Date.now();

	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
			createdAt,
		})
		.onConflictDoUpdate({
			target: terminalSessions.id,
			set: {
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt,
				endedAt: null,
			},
		})
		.run();

	// Determine shell readiness support. Adopted sessions are already past
	// shell startup, so treat them as immediately ready — the OSC 133;A
	// marker has already flown by and we don't want to gate writes on it.
	const shellName = shell.split("/").pop() || shell;
	const shellSupportsReady =
		!isAdopted && SHELLS_WITH_READY_MARKER.has(shellName);

	let shellReadyResolve: (() => void) | null = null;
	const shellReadyPromise = shellSupportsReady
		? new Promise<void>((resolve) => {
				shellReadyResolve = resolve;
			})
		: Promise.resolve();

	const session: TerminalSession = {
		terminalId,
		workspaceId,
		pty,
		cols,
		rows,
		unsubscribeDaemon: null,
		sockets: new Set(),
		buffer: [],
		bufferBytes: 0,
		fullReplayBuffer: null,
		preserveBufferUntilReplayBoundary: isAdopted,
		nextAttachReplayKind: isAdopted ? "delta" : "none",
		attachReadyPromise: Promise.resolve(),
		// Adopted sessions kept a live shell — nothing was restored.
		restoredNoticePending: restoredNotice && !isAdopted,
		createdAt,
		exited: false,
		exitCode: 0,
		exitSignal: 0,
		listed,
		title: null,
		titleScanState: createTerminalTitleScanState(),
		eventBus,
		shellReadyState: shellSupportsReady
			? "pending"
			: isAdopted
				? "ready"
				: "unsupported",
		shellReadyResolve,
		shellReadyPromise,
		shellReadyTimeoutId: null,
		scanState: createScanState(),
		// Adopted sessions have already run their initialCommand in the prior
		// host-service lifetime — flag it as queued so we don't double-fire it.
		initialCommandQueued: isAdopted,
		initialCommandResult: null,
		pendingMutationErrors: [],
		portHintDecoder: new StringDecoder("utf8"),
		modeTracker: createModeTracker(cols, rows),
	};
	sessions.set(terminalId, session);
	portManager.upsertSession(terminalId, workspaceId, pty.pid);

	// If the marker never arrives (broken wrapper, unsupported config),
	// the timeout unblocks so the session degrades gracefully.
	if (session.shellReadyState === "pending") {
		session.shellReadyTimeoutId = setTimeout(() => {
			resolveShellReady(session, "timed_out");
		}, SHELL_READY_TIMEOUT_MS);
	}

	const daemonCallbacks: SubscribeCallbacks = {
		onOutput(chunk) {
			// Bytes flow daemon → host → xterm without UTF-8 decoding;
			// per-chunk `.toString("utf8")` here would mangle codepoints
			// straddling chunk boundaries. (See no-encoding-hops.test.ts.)
			const titleUpdates = scanForTerminalTitle(session.titleScanState, chunk);
			for (const title of titleUpdates.updates) {
				setSessionTitle(session, title);
			}

			let bytes: Uint8Array = chunk;
			if (session.shellReadyState === "pending") {
				const result = scanForShellReady(session.scanState, chunk);
				bytes = result.output;
				if (result.matched) {
					resolveShellReady(session, "ready");
				}
			}
			if (bytes.byteLength === 0) return;

			// portManager.checkOutputForHint runs URL/port regexes on
			// strings; the per-session StringDecoder buffers partial
			// codepoints across chunks. This is a side branch — the
			// transport above stays on bytes.
			const hintText = session.portHintDecoder.write(
				bytes instanceof Buffer
					? bytes
					: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
			);
			if (hintText.length > 0) portManager.checkOutputForHint(hintText);

			// Feed the tracker on every byte — broadcast skips the FIFO,
			// so this is the only path that catches startup mode escapes.
			session.modeTracker.feed(bytes);

			if (broadcastBytes(session, bytes) === 0) {
				bufferOutput(session, bytes);
			}
		},
		onExit({ code, signal }) {
			session.exited = true;
			session.exitCode = code ?? 0;
			session.exitSignal = signal ?? 0;
			const occurredAt = Date.now();

			portManager.unregisterSession(terminalId);

			db.update(terminalSessions)
				.set({ status: "exited", endedAt: occurredAt })
				.where(eq(terminalSessions.id, terminalId))
				.run();

			broadcastMessage(session, {
				type: "exit",
				exitCode: session.exitCode,
				signal: session.exitSignal,
			});

			eventBus?.broadcastTerminalLifecycle({
				workspaceId,
				terminalId,
				eventType: "exit",
				exitCode: session.exitCode,
				signal: session.exitSignal,
				occurredAt,
			});
		},
	};

	try {
		if (isAdopted) {
			// Adoption must always request the daemon ring. The renderer may have
			// survived the host restart, but `attached.full` lets it atomically
			// replace that baseline; suppressing replay would lose bytes emitted
			// while the WebSocket was down.
			const subscription = pty.subscribeWithReplayBoundary(
				{ replay: true },
				daemonCallbacks,
			);
			session.unsubscribeDaemon = () => subscription.dispose();
			session.attachReadyPromise = subscription.boundary
				.then(({ replayBytes }) => {
					const effectiveReplayBytes = replayBytes ?? session.bufferBytes;
					if (replayBytes === null) {
						console.warn(
							`[terminal] adopted ${terminalId} from a pre-ACK daemon; classifying ${effectiveReplayBytes} ordered buffered bytes as a full replay`,
						);
					}
					if (effectiveReplayBytes > 0) {
						session.fullReplayBuffer = takeBufferedPrefix(
							session,
							effectiveReplayBytes,
						);
						session.nextAttachReplayKind = "full";
					} else {
						// Empty ring: a later live byte is a delta and must not clear the
						// renderer. The ordered list barrier makes this true for new and
						// legacy daemons alike.
						session.nextAttachReplayKind = "delta";
					}
				})
				.finally(() => {
					session.preserveBufferUntilReplayBoundary = false;
					trimBufferedOutput(session);
				});
			await session.attachReadyPromise;
		} else {
			const subscription = pty.subscribe({ replay: false }, daemonCallbacks);
			session.unsubscribeDaemon = () => subscription.dispose();
		}
	} catch (error) {
		try {
			session.unsubscribeDaemon?.();
		} catch {
			// The boundary can reject because the daemon disconnected. Cleanup must
			// still remove the half-created host session when unsubscribe cannot send.
		}
		// Local subscription disposal deliberately leaves the permanent aggregate
		// observer alive across subscriber churn. A failed session creation has no
		// owner left, so tear that observer down explicitly.
		session.pty.disposeSubscriptions();
		session.unsubscribeDaemon = null;
		if (sessions.get(terminalId) === session) sessions.delete(terminalId);
		portManager.unregisterSession(terminalId);
		if (session.shellReadyTimeoutId) {
			clearTimeout(session.shellReadyTimeoutId);
			session.shellReadyTimeoutId = null;
		}
		session.modeTracker.dispose();
		return {
			error:
				error instanceof Error
					? error.message
					: "Failed to subscribe to terminal",
		};
	}

	if (initialCommand) {
		await queueInitialCommand(session, initialCommand, daemon);
	}

	return session;
}

export function registerWorkspaceTerminalRoute({
	app,
	db,
	eventBus,
	upgradeWebSocket,
}: RegisterWorkspaceTerminalRouteOptions) {
	app.post("/terminal/sessions", async (c) => {
		const body = await c.req.json<{
			terminalId: string;
			workspaceId: string;
			themeType?: string;
			initialCommand?: string;
			cwd?: string;
			cols?: number;
			rows?: number;
		}>();

		if (!body.terminalId || !body.workspaceId) {
			return c.json({ error: "Missing terminalId or workspaceId" }, 400);
		}

		const result = await createTerminalSessionInternal({
			terminalId: body.terminalId,
			workspaceId: body.workspaceId,
			themeType: parseThemeType(body.themeType),
			db,
			eventBus,
			initialCommand: body.initialCommand,
			cwd: body.cwd,
			cols: body.cols,
			rows: body.rows,
		});

		if ("error" in result) {
			return c.json({ error: result.error }, 500);
		}

		return c.json({
			terminalId: result.terminalId,
			status: "active",
			...(body.initialCommand && {
				initialCommand: result.initialCommandResult ?? { status: "pending" },
			}),
		});
	});

	// REST dispose — does not require an open WebSocket
	app.delete("/terminal/sessions/:terminalId", async (c) => {
		const terminalId = c.req.param("terminalId");
		if (!terminalId) {
			return c.json({ error: "Missing terminalId" }, 400);
		}

		const session = sessions.get(terminalId);
		if (!session) {
			return c.json({ error: "Session not found" }, 404);
		}

		try {
			const result = await disposeSessionAndWait(terminalId, db);
			if (!result.daemonCloseSucceeded) {
				return c.json({ error: "Failed to close terminal session" }, 503);
			}
			return c.json({ terminalId, status: "disposed" });
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to dispose terminal session";
			return c.json(
				{ error: message },
				error instanceof DaemonMutationQueueOverflowError ? 429 : 503,
			);
		}
	});

	// REST list — enumerate live terminal sessions
	app.get("/terminal/sessions", (c) => {
		const workspaceId = c.req.query("workspaceId") || undefined;
		return c.json({
			sessions: listTerminalSessions({ workspaceId, includeExited: true }),
		});
	});

	app.get("/terminal/resource-sessions", async (c) => {
		try {
			const daemon = await getDaemonClient();
			const titlesByTerminalId = new Map(
				Array.from(sessions.values()).map((session) => [
					session.terminalId,
					session.title,
				]),
			);
			return c.json({
				sessions: listTerminalResourceSessions(
					db,
					await daemon.list(),
					titlesByTerminalId,
				),
			});
		} catch (error) {
			console.warn("[terminal] Failed to list resource sessions", error);
			return c.json({ sessions: [] });
		}
	});

	app.get(
		"/terminal/:terminalId",
		upgradeWebSocket((c) => {
			const terminalId = c.req.param("terminalId") ?? "";
			const requestedWorkspaceId = c.req.query("workspaceId") || null;
			const attachSocketToSession = (
				session: TerminalSession,
				ws: TerminalSocket,
			): boolean => {
				if (session.sockets.has(ws)) return false;
				session.sockets.add(ws);
				const replayKind = session.nextAttachReplayKind;
				sendMessage(ws, { type: "attached", terminalId, replayKind });
				if (replayKind === "none") {
					session.nextAttachReplayKind = "delta";
				}

				db.update(terminalSessions)
					.set({ lastAttachedAt: Date.now() })
					.where(eq(terminalSessions.id, terminalId))
					.run();

				sendMessage(ws, { type: "title", title: session.title });
				replayBuffer(session, ws);
				flushPendingMutationErrors(session, ws);
				if (session.exited) {
					sendMessage(ws, {
						type: "exit",
						exitCode: session.exitCode,
						signal: session.exitSignal,
					});
				}
				return true;
			};
			const resolveSessionForAttach = async (): Promise<
				TerminalSession | { error: string }
			> => {
				const existing = sessions.get(terminalId);
				if (existing) {
					if (requestedWorkspaceId) {
						const mismatchError = getTerminalWorkspaceMismatchError({
							terminalId,
							ownerWorkspaceId: existing.workspaceId,
							requestedWorkspaceId,
						});
						if (mismatchError) return { error: mismatchError };
					}
					try {
						await existing.attachReadyPromise;
					} catch (error) {
						return {
							error:
								error instanceof Error
									? error.message
									: "Failed to attach terminal replay",
						};
					}
					return existing;
				}

				const record = db.query.terminalSessions
					.findFirst({ where: eq(terminalSessions.id, terminalId) })
					.sync();
				if (!record) {
					return {
						error: `Terminal session "${terminalId}" not found; create it before connecting.`,
					};
				}
				if (record.status === "disposed") {
					return { error: `Terminal session "${terminalId}" is disposed.` };
				}
				if (record.status === "exited") {
					return { error: `Terminal session "${terminalId}" has exited.` };
				}
				if (!record.originWorkspaceId) {
					return {
						error: `Terminal session "${terminalId}" is missing a workspace.`,
					};
				}
				if (requestedWorkspaceId) {
					const mismatchError = getTerminalWorkspaceMismatchError({
						terminalId,
						ownerWorkspaceId: record.originWorkspaceId,
						requestedWorkspaceId,
					});
					if (mismatchError) return { error: mismatchError };
				}

				const themeType = parseThemeType(c.req.query("themeType"));

				// Prefer adoption: if the daemon still owns the PTY across a
				// host-service restart, we keep the live shell + ring buffer.
				const adopted = await createTerminalSessionInternal({
					terminalId,
					workspaceId: record.originWorkspaceId,
					themeType,
					db,
					eventBus,
					adoptOnly: true,
				});
				if (!("error" in adopted)) return adopted;

				// Active row but daemon no longer owns the PTY (laptop sleep,
				// daemon restart, machine reboot). Respawn rather than dead-end
				// the pane — the renderer's xterm scrollback stays painted above.
				console.log(`[terminal] respawning lost session ${terminalId}`);
				return createTerminalSessionInternal({
					terminalId,
					workspaceId: record.originWorkspaceId,
					themeType,
					db,
					eventBus,
					restoredNotice: true,
				});
			};

			return {
				onOpen: (_event, ws) => {
					if (!terminalId) {
						ws.close(1011, "Missing terminalId");
						return;
					}

					void (async () => {
						const session = await resolveSessionForAttach();
						if ("error" in session) {
							sendMessage(ws, { type: "error", message: session.error });
							ws.close(1011, session.error);
							return;
						}
						if (ws.readyState !== SOCKET_OPEN) return;
						attachSocketToSession(session, ws);
					})().catch((error) => {
						console.error("[terminal] unexpected error during attach", error);
						if (ws.readyState !== SOCKET_OPEN) return;
						sendMessage(ws, {
							type: "error",
							message: "Internal terminal attach error",
						});
						ws.close(1011, "Internal terminal attach error");
					});
				},

				onMessage: (event, ws) => {
					let message: TerminalClientMessage;
					try {
						message = JSON.parse(String(event.data)) as TerminalClientMessage;
					} catch {
						sendMessage(ws, {
							type: "error",
							message: "Invalid terminal message payload",
						});
						return;
					}

					const session = sessions.get(terminalId ?? "");
					if (!session || !session.sockets.has(ws)) return;

					if (message.type === "dispose") {
						disposeSession(terminalId ?? "", db);
						return;
					}

					if (session.exited) return;

					if (message.type === "input") {
						void session.pty.write(message.data).catch((error) => {
							reportSessionMutationError(session, "input", error);
						});
						return;
					}

					if (message.type === "resize") {
						const cols = normalizeTerminalDimension(
							message.cols,
							MIN_TERMINAL_COLS,
							DEFAULT_TERMINAL_COLS,
						);
						const rows = normalizeTerminalDimension(
							message.rows,
							MIN_TERMINAL_ROWS,
							DEFAULT_TERMINAL_ROWS,
						);
						void session.pty
							.resize(cols, rows)
							.then(() => {
								session.modeTracker.resize(cols, rows);
								session.cols = cols;
								session.rows = rows;
							})
							.catch((error) => {
								reportSessionMutationError(session, "resize", error);
							});
					}
				},

				onClose: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					session?.sockets.delete(ws);
				},

				onError: (_event, ws) => {
					const session = sessions.get(terminalId ?? "");
					session?.sockets.delete(ws);
				},
			};
		}),
	);
}

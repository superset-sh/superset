import { type FSWatcher, watch } from "node:fs";
import type { EventBus } from "../events/event-bus";
import {
	readLatestColorAndTitle,
	resolveTranscriptPath,
} from "./claude-transcript";
import type { TerminalAgentStore } from "./store";
import type { TerminalAgentBinding } from "./types";

const RESCAN_INTERVAL_MS = 10_000;
const DEBOUNCE_MS = 300;

/**
 * Only Claude Code writes the transcript shape `claude-transcript.ts` parses
 * (`agent-color`/`ai-title` lines) — other agent ids are never watched.
 */
const CLAUDE_AGENT_ID = "claude";

interface WatchedTranscript {
	workspaceId: string;
	path: string;
	watcher: FSWatcher;
}

/**
 * Tails each active Claude terminal-agent binding's transcript file for
 * `agent-color`/`ai-title` lines and republishes changes onto
 * `TerminalAgentStore`'s live-meta overlay (`updateAgentMeta`).
 *
 * Modeled on `GitWatcher`: `fs.watch` per target + debounce + periodic
 * rescan. The rescan does double duty: it discovers newly-eligible bindings
 * (a binding's `cwd`/`agentSessionId` can arrive after this watcher last
 * looked, and the transcript file itself may not exist yet — nothing is
 * written until the session's first message) and it re-checks already-watched
 * bindings as a fallback against a missed `fs.watch` notification.
 */
export class ClaudeTranscriptWatcher {
	private readonly store: TerminalAgentStore;
	private readonly eventBus: EventBus;
	private readonly watched = new Map<string, WatchedTranscript>();
	private readonly debounceTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private rescanTimer: ReturnType<typeof setInterval> | null = null;
	private onStoreChange: (() => void) | null = null;
	private closed = false;

	constructor(store: TerminalAgentStore, eventBus: EventBus) {
		this.store = store;
		this.eventBus = eventBus;
	}

	start(): void {
		this.refresh();
		this.rescanTimer = setInterval(() => this.refresh(), RESCAN_INTERVAL_MS);
		this.onStoreChange = () => this.refresh();
		this.store.on("change", this.onStoreChange);
	}

	close(): void {
		this.closed = true;
		if (this.rescanTimer) {
			clearInterval(this.rescanTimer);
			this.rescanTimer = null;
		}
		if (this.onStoreChange) {
			this.store.off("change", this.onStoreChange);
			this.onStoreChange = null;
		}
		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();
		for (const entry of this.watched.values()) {
			entry.watcher.close();
		}
		this.watched.clear();
	}

	private refresh(): void {
		if (this.closed) return;

		const eligible = new Map<string, TerminalAgentBinding>();
		for (const binding of this.store.list()) {
			if (binding.agentId !== CLAUDE_AGENT_ID) continue;
			if (!binding.cwd || !binding.agentSessionId) continue;
			eligible.set(binding.terminalId, binding);
		}

		for (const [terminalId, entry] of this.watched) {
			const binding = eligible.get(terminalId);
			const expectedPath = binding
				? resolveTranscriptPath(
						binding.cwd as string,
						binding.agentSessionId as string,
					)
				: null;
			if (!binding || expectedPath !== entry.path) {
				entry.watcher.close();
				this.watched.delete(terminalId);
			}
		}

		for (const [terminalId, binding] of eligible) {
			if (this.watched.has(terminalId)) {
				// Belt-and-suspenders re-check: `fs.watch` can silently miss a
				// notification (e.g. two appends landing in the same debounce
				// window, or an FSEvents coalescing quirk on macOS), which would
				// otherwise strand a binding's title/color until some later
				// unrelated write happens to fire the watcher again.
				const entry = this.watched.get(terminalId);
				if (entry) this.checkAndEmit(terminalId, entry.workspaceId, entry.path);
				continue;
			}
			this.watchBinding(binding);
		}
	}

	private watchBinding(binding: TerminalAgentBinding): void {
		if (!binding.cwd || !binding.agentSessionId) return;
		const { terminalId, workspaceId } = binding;
		const path = resolveTranscriptPath(binding.cwd, binding.agentSessionId);

		// Check immediately in case the transcript already has lines from
		// before this watcher started (e.g. host-service restart mid-session).
		this.checkAndEmit(terminalId, workspaceId, path);

		let watcher: FSWatcher;
		try {
			watcher = watch(path, () => {
				this.scheduleCheck(terminalId, workspaceId, path);
			});
		} catch {
			// Transcript doesn't exist yet — the next rescan retries.
			return;
		}

		watcher.on("error", () => {
			watcher.close();
			this.watched.delete(terminalId);
		});

		this.watched.set(terminalId, { workspaceId, path, watcher });
	}

	private scheduleCheck(
		terminalId: string,
		workspaceId: string,
		path: string,
	): void {
		const existing = this.debounceTimers.get(terminalId);
		if (existing) clearTimeout(existing);
		this.debounceTimers.set(
			terminalId,
			setTimeout(() => {
				this.debounceTimers.delete(terminalId);
				this.checkAndEmit(terminalId, workspaceId, path);
			}, DEBOUNCE_MS),
		);
	}

	private checkAndEmit(
		terminalId: string,
		workspaceId: string,
		path: string,
	): void {
		const result = readLatestColorAndTitle(path);
		// Omit undefined keys entirely rather than setting them — the store
		// merges this object onto prior state, and an explicit `undefined`
		// value would clobber an already-known title/color.
		const meta: { title?: string; color?: string } = {
			...(result.color !== undefined ? { color: result.color } : {}),
			...(result.title !== undefined ? { title: result.title } : {}),
		};
		if (Object.keys(meta).length === 0) return;
		this.store.updateAgentMeta(terminalId, workspaceId, meta);
		// The renderer's terminal-agent-bindings query only invalidates on
		// `agent:lifecycle`/`terminal:lifecycle`/`agent:meta` broadcasts — the
		// store's own "change" EventEmitter never reaches the renderer.
		this.eventBus.broadcastAgentMeta({
			workspaceId,
			terminalId,
			occurredAt: Date.now(),
		});
	}
}

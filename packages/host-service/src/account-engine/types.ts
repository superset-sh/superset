/**
 * Shared shapes for the account engine. Everything here is persisted
 * host-wide under $SUPERSET_HOME_DIR/state/account-engine/ (KTD5), so no
 * field may ever carry token material: account ids, display labels and
 * profile-dir paths only.
 */

export type AccountAgent = "claude" | "codex";

/** R12: stay put until the active account nears its limit, or drain one first. */
export type SwitchStrategy = "best" | "consume-first";

/** R14: how often the active account's quota is polled. */
export type PollIntervalSeconds = 30 | 60 | 120 | 300;

/** Per-agent auto-switch configuration; defaults per R10 to R15. */
export interface AutoSwitchSettings {
	enabled: boolean;
	/** 1 to 100; the active account is "near its limit" at or above this. */
	thresholdPercent: number;
	strategy: SwitchStrategy;
	/** Provider model display names whose weekly window joins the decision. */
	modelWindows: string[];
	pollIntervalSeconds: PollIntervalSeconds;
	cooldownSeconds: number;
}

export type EngineSettings = Record<AccountAgent, AutoSwitchSettings>;

/** R16: account key -> in rotation. Absent means "use the default". */
export type RotationState = Record<string, boolean>;

export type SwitchReasonKind =
	| "threshold"
	| "strategy"
	| "manual"
	| "fallback"
	| "fallback-rejected"
	| "external";

/** R21: one switch history row. Labels are display strings, never emails. */
export interface HistoryEntry {
	at: number;
	agent: AccountAgent;
	fromAccountId: string | null;
	fromLabel: string | null;
	toAccountId: string | null;
	toLabel: string | null;
	reasonKind: SwitchReasonKind;
	windowId?: string | null;
	usedPercent?: number | null;
	fallbackRestart?: boolean;
}

export interface AgentRuntimeState {
	/** R15: no automatic switch happens before this timestamp. */
	cooldownUntil: number | null;
	/** R22: latch so the all-exhausted state notifies once. */
	exhaustedNotifiedAt: number | null;
	/** KTD7: fallback switch timestamps, for the per-hour ceiling. */
	fallbackTimestamps: number[];
	activeAccountId: string | null;
	activeSelection: string | null;
}

export interface RuntimeState {
	version: 1;
	perAgent: Record<AccountAgent, AgentRuntimeState>;
	/** KTD3: account id -> profile dir; null means the system-default store. */
	identityBindings: Record<string, string | null>;
	/** KTD3: the macOS Keychain attributes that matched on read. */
	keychain?: { service: string | null; account: string | null };
}

/** The lock owner's latest quota-store snapshot, served to lock losers. */
export interface QuotaSnapshot {
	writtenAt: number;
	/** Opaque to this module: the quota store (U2) owns the shape. */
	data: unknown;
}

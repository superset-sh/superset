import type { HostAgentConfig } from "@superset/host-service/settings";
import { useCallback, useMemo, useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

export type AgentSessionPlacement = "split-pane" | "new-tab";

export type AgentTarget =
	| { kind: "existing"; terminalId: string }
	| { kind: "new"; configId: string; placement: AgentSessionPlacement };

export interface DecodedAgentSelection {
	kind: "existing" | "new";
	id: string;
}

export const EXISTING_PREFIX = "existing:";
export const NEW_PREFIX = "new:";

export function decodeAgentSelection(
	value: string,
): DecodedAgentSelection | null {
	if (value.startsWith(EXISTING_PREFIX)) {
		return { kind: "existing", id: value.slice(EXISTING_PREFIX.length) };
	}
	if (value.startsWith(NEW_PREFIX)) {
		return { kind: "new", id: value.slice(NEW_PREFIX.length) };
	}
	return null;
}

export interface AgentTargetStorageKeys {
	/** Last picked terminal session id. */
	terminalId: string;
	/** Last picked new-session config id. */
	configId: string;
	/** Last picked placement for new sessions. */
	placement: string;
}

interface UseAgentTargetArgs {
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
	storageKeys: AgentTargetStorageKeys;
	defaultPlacement?: AgentSessionPlacement;
}

export interface UseAgentTargetResult {
	/** Encoded selection (`existing:<id>` | `new:<id>`) or null while data
	 *  is still loading. */
	value: string | null;
	placement: AgentSessionPlacement;
	resolved: AgentTarget | null;
	onValueChange: (next: string) => void;
	onPlacementChange: (next: string) => void;
}

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, value);
}

/**
 * Selection state + localStorage persistence for an agent picker. Default
 * value is *derived* from sessions + configs + storage on every render, so a
 * freshly mounted surface reflects the last-picked target as soon as data
 * loads (no useEffect flicker). Picks for existing-session vs new-session are
 * persisted independently so they don't clobber each other.
 *
 * Storage keys are passed in so the same hook can back multiple surfaces
 * (DiffPane comment composer, top-right PR action button, etc.) without
 * picks bleeding across them.
 *
 * Priority for the default selection:
 *   1. last picked terminal session, if still alive
 *   2. most recent active session
 *   3. last picked new-agent config, if still listed
 *   4. first config
 */
export function useAgentTarget({
	sessions,
	configs,
	storageKeys,
	defaultPlacement = "split-pane",
}: UseAgentTargetArgs): UseAgentTargetResult {
	const [override, setOverride] = useState<string | null>(null);
	const [placement, setPlacement] = useState<AgentSessionPlacement>(() => {
		const stored = readStorage(storageKeys.placement);
		return stored === "new-tab" || stored === "split-pane"
			? stored
			: defaultPlacement;
	});

	const computedDefault = useMemo<string | null>(() => {
		if (sessions.length > 0) {
			const stored = readStorage(storageKeys.terminalId);
			const alive =
				stored && sessions.some((s) => s.terminalId === stored)
					? stored
					: sessions[0]?.terminalId;
			if (alive) return `${EXISTING_PREFIX}${alive}`;
		}
		if (configs.length === 0) return null;
		const storedConfigId = readStorage(storageKeys.configId);
		const fromStorage =
			storedConfigId && configs.some((c) => c.id === storedConfigId)
				? storedConfigId
				: configs[0]?.id;
		return fromStorage ? `${NEW_PREFIX}${fromStorage}` : null;
	}, [sessions, configs, storageKeys.terminalId, storageKeys.configId]);

	// Validate the override against current data — if their pick is now gone
	// (terminal died, config deleted), fall back to the default.
	const overrideIsValid = useMemo(() => {
		if (!override) return false;
		const decoded = decodeAgentSelection(override);
		if (!decoded) return false;
		if (decoded.kind === "existing") {
			return sessions.some((s) => s.terminalId === decoded.id);
		}
		return configs.some((c) => c.id === decoded.id);
	}, [override, sessions, configs]);

	const value = overrideIsValid ? override : computedDefault;

	const resolved = useMemo<AgentTarget | null>(() => {
		if (!value) return null;
		const decoded = decodeAgentSelection(value);
		if (!decoded) return null;
		if (decoded.kind === "existing") {
			return { kind: "existing", terminalId: decoded.id };
		}
		return { kind: "new", configId: decoded.id, placement };
	}, [value, placement]);

	const onValueChange = useCallback(
		(next: string) => {
			setOverride(next);
			const decoded = decodeAgentSelection(next);
			if (!decoded) return;
			writeStorage(
				decoded.kind === "existing"
					? storageKeys.terminalId
					: storageKeys.configId,
				decoded.id,
			);
		},
		[storageKeys.terminalId, storageKeys.configId],
	);

	const onPlacementChange = useCallback(
		(next: string) => {
			if (next !== "split-pane" && next !== "new-tab") return;
			setPlacement(next);
			writeStorage(storageKeys.placement, next);
		},
		[storageKeys.placement],
	);

	return { value, placement, resolved, onValueChange, onPlacementChange };
}

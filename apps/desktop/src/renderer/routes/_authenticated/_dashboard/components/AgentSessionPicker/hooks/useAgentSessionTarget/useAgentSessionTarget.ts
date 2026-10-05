import type { HostAgentConfig } from "@superset/host-service/settings";
import { useCallback, useMemo, useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

import {
	type AgentSessionPlacement,
	useAgentSessionPlacement,
} from "renderer/hooks/useAgentSessionPlacement";

export type { AgentSessionPlacement } from "renderer/hooks/useAgentSessionPlacement";

export type AgentTarget =
	| { kind: "existing"; terminalId: string }
	| { kind: "new"; configId: string; placement: AgentSessionPlacement };

export interface DecodedSelection {
	kind: "existing" | "new";
	id: string;
}

export const EXISTING_PREFIX = "existing:";
export const NEW_PREFIX = "new:";

const LAST_NEW_AGENT_CONFIG_ID_KEY = "lastSelectedDiffCommentNewAgentConfigId";
const LAST_TERMINAL_ID_KEY = "lastSelectedDiffCommentTerminalId";

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	return window.localStorage.getItem(key);
}

function writeStorage(key: string, value: string) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, value);
}

export function decodeSelection(value: string): DecodedSelection | null {
	if (value.startsWith(EXISTING_PREFIX)) {
		return { kind: "existing", id: value.slice(EXISTING_PREFIX.length) };
	}
	if (value.startsWith(NEW_PREFIX)) {
		return { kind: "new", id: value.slice(NEW_PREFIX.length) };
	}
	return null;
}

interface UseAgentSessionTargetArgs {
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

interface UseAgentSessionTargetResult {
	/** Encoded selection (`existing:<id>` | `new:<id>`) or null while data
	 *  is still loading. */
	value: string | null;
	placement: AgentSessionPlacement;
	resolved: AgentTarget | null;
	onValueChange: (next: string) => void;
}

/**
 * Resolves the composer's current agent target and placement. The default
 * value is *derived* from sessions + configs + localStorage on every render,
 * so a freshly mounted composer reflects the last-picked target as soon as
 * data loads (no useEffect flicker). Picks are persisted independently so
 * existing-session and new-session preferences don't clobber each other.
 *
 * Priority for the default selection:
 *   1. last picked terminal session, if still alive
 *   2. most recent active session
 *   3. last picked new-agent config, if still listed
 *   4. first config
 */
export function useAgentSessionTarget({
	sessions,
	configs,
}: UseAgentSessionTargetArgs): UseAgentSessionTargetResult {
	const [override, setOverride] = useState<string | null>(null);
	const placement = useAgentSessionPlacement();

	const computedDefault = useMemo<string | null>(() => {
		if (sessions.length > 0) {
			const stored = readStorage(LAST_TERMINAL_ID_KEY);
			const alive =
				stored && sessions.some((s) => s.terminalId === stored)
					? stored
					: sessions[0]?.terminalId;
			if (alive) return `${EXISTING_PREFIX}${alive}`;
		}
		if (configs.length === 0) return null;
		const storedConfigId = readStorage(LAST_NEW_AGENT_CONFIG_ID_KEY);
		const fromStorage =
			storedConfigId && configs.some((c) => c.id === storedConfigId)
				? storedConfigId
				: configs[0]?.id;
		return fromStorage ? `${NEW_PREFIX}${fromStorage}` : null;
	}, [sessions, configs]);

	// Validate the user's override against current data — if their pick is
	// now gone (terminal died, config deleted), fall back to the default.
	const overrideIsValid = useMemo(() => {
		if (!override) return false;
		const decoded = decodeSelection(override);
		if (!decoded) return false;
		if (decoded.kind === "existing") {
			return sessions.some((s) => s.terminalId === decoded.id);
		}
		return configs.some((c) => c.id === decoded.id);
	}, [override, sessions, configs]);

	const value = overrideIsValid ? override : computedDefault;

	const resolved = useMemo<AgentTarget | null>(() => {
		if (!value) return null;
		const decoded = decodeSelection(value);
		if (!decoded) return null;
		if (decoded.kind === "existing") {
			return { kind: "existing", terminalId: decoded.id };
		}
		return { kind: "new", configId: decoded.id, placement };
	}, [value, placement]);

	const onValueChange = useCallback((next: string) => {
		setOverride(next);
		const decoded = decodeSelection(next);
		if (!decoded) return;
		writeStorage(
			decoded.kind === "existing"
				? LAST_TERMINAL_ID_KEY
				: LAST_NEW_AGENT_CONFIG_ID_KEY,
			decoded.id,
		);
	}, []);

	return { value, placement, resolved, onValueChange };
}

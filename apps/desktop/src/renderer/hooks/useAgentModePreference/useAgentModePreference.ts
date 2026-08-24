import { getAgentModeSupport } from "@superset/shared/agent-models";
import { useCallback, useEffect, useState } from "react";

function readStoredMap(storageKey: string): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}

function readStoredMode(
	storageKey: string,
	presetId: string | null,
): string | null {
	if (!presetId) return null;
	const stored = readStoredMap(storageKey)[presetId];
	if (!stored) return null;
	// Drop ids that fell out of the curated registry. No override is safer than
	// forwarding a launch mode the CLI no longer accepts.
	const support = getAgentModeSupport(presetId);
	return support?.modes.some((mode) => mode.id === stored) ? stored : null;
}

/**
 * Last-selected launch mode per agent preset, persisted as a bounded JSON map
 * in localStorage. `null` means the CLI default and removes the preset entry.
 */
export function useAgentModePreference(
	storageKey: string,
	presetId: string | null,
) {
	const [selectedMode, setSelectedModeState] = useState<string | null>(() =>
		readStoredMode(storageKey, presetId),
	);

	useEffect(() => {
		setSelectedModeState(readStoredMode(storageKey, presetId));
	}, [storageKey, presetId]);

	const setSelectedMode = useCallback(
		(mode: string | null) => {
			setSelectedModeState(mode);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			if (mode) {
				map[presetId] = mode;
			} else {
				delete map[presetId];
			}
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(map));
			} catch {
				// Quota/security errors only cost persistence of the preference;
				// the in-memory selection above still applies to this dialog.
			}
		},
		[storageKey, presetId],
	);

	return { selectedMode, setSelectedMode };
}

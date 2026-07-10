import { getAgentEffortSupport } from "@superset/shared/agent-models";
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

function readStoredEffort(
	storageKey: string,
	presetId: string | null,
): string | null {
	if (!presetId) return null;
	const stored = readStoredMap(storageKey)[presetId];
	if (!stored) return null;
	// Drop ids that fell out of the curated registry — "Default" beats a
	// flag value the CLI no longer accepts.
	const support = getAgentEffortSupport(presetId);
	return support?.efforts.some((effort) => effort.id === stored)
		? stored
		: null;
}

/**
 * Last-selected reasoning effort per agent preset, persisted as a JSON map in
 * localStorage. Same contract as `useAgentModelPreference`: keyed by presetId
 * so the preference survives host switches; `null` means "Default" — no
 * stored entry, no effort flag at launch.
 */
export function useAgentEffortPreference(
	storageKey: string,
	presetId: string | null,
) {
	const [selectedEffort, setSelectedEffortState] = useState<string | null>(() =>
		readStoredEffort(storageKey, presetId),
	);

	useEffect(() => {
		setSelectedEffortState(readStoredEffort(storageKey, presetId));
	}, [storageKey, presetId]);

	const setSelectedEffort = useCallback(
		(effort: string | null) => {
			setSelectedEffortState(effort);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			if (effort) {
				map[presetId] = effort;
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

	return { selectedEffort, setSelectedEffort };
}

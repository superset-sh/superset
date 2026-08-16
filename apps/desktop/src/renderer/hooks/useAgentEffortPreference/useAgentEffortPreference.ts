import {
	type AgentEffortSupport,
	getAgentEffortSupport,
} from "@superset/shared/agent-models";
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
	model: string | null,
	supportOverride?: AgentEffortSupport,
): string | null {
	if (!presetId) return null;
	const preferenceKey = model ? `${presetId}:${model}` : presetId;
	const stored = readStoredMap(storageKey)[preferenceKey];
	if (!stored) return null;
	// Drop ids that fell out of the curated registry — "Default" beats a
	// flag value the CLI no longer accepts.
	const support = supportOverride ?? getAgentEffortSupport(presetId, model);
	return support?.efforts.some((effort) => effort.id === stored)
		? stored
		: null;
}

/**
 * Last-selected reasoning effort per agent model, persisted as a JSON map in
 * localStorage. Model-scoped keys prevent a value supported by one model from
 * leaking into another; `null` means no override flag at launch.
 */
export function useAgentEffortPreference(
	storageKey: string,
	presetId: string | null,
	model: string | null,
	supportOverride?: AgentEffortSupport,
) {
	const [selectedEffort, setSelectedEffortState] = useState<string | null>(() =>
		readStoredEffort(storageKey, presetId, model, supportOverride),
	);

	useEffect(() => {
		setSelectedEffortState(
			readStoredEffort(storageKey, presetId, model, supportOverride),
		);
	}, [storageKey, presetId, model, supportOverride]);

	const setSelectedEffort = useCallback(
		(effort: string | null) => {
			setSelectedEffortState(effort);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			const preferenceKey = model ? `${presetId}:${model}` : presetId;
			if (effort) {
				map[preferenceKey] = effort;
			} else {
				delete map[preferenceKey];
			}
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(map));
			} catch {
				// Quota/security errors only cost persistence of the preference;
				// the in-memory selection above still applies to this dialog.
			}
		},
		[storageKey, presetId, model],
	);

	return { selectedEffort, setSelectedEffort };
}

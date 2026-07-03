import { getAgentModelSupport } from "@superset/shared/agent-models";
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

function readStoredModel(
	storageKey: string,
	presetId: string | null,
): string | null {
	if (!presetId) return null;
	const stored = readStoredMap(storageKey)[presetId];
	if (!stored) return null;
	// Drop ids that fell out of the curated registry — "Default" beats a
	// flag value the CLI no longer accepts.
	const support = getAgentModelSupport(presetId);
	return support?.models.some((model) => model.id === stored) ? stored : null;
}

/**
 * Last-selected model per agent preset, persisted as a JSON map in
 * localStorage. Keyed by presetId (not config UUID) so the preference
 * survives host switches and agent-config re-creation. `null` means
 * "Default" — no stored entry, no model flag at launch.
 */
export function useAgentModelPreference(
	storageKey: string,
	presetId: string | null,
) {
	const [selectedModel, setSelectedModelState] = useState<string | null>(() =>
		readStoredModel(storageKey, presetId),
	);

	useEffect(() => {
		setSelectedModelState(readStoredModel(storageKey, presetId));
	}, [storageKey, presetId]);

	const setSelectedModel = useCallback(
		(model: string | null) => {
			setSelectedModelState(model);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			if (model) {
				map[presetId] = model;
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

	return { selectedModel, setSelectedModel };
}

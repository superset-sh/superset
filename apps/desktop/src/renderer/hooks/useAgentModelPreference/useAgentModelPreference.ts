import {
	type AgentModelSupport,
	getAgentModelSupport,
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

function readStoredModel(
	storageKey: string,
	presetId: string | null,
	supportOverride?: AgentModelSupport,
): string | null {
	if (!presetId) return null;
	const support = supportOverride ?? getAgentModelSupport(presetId);
	const stored = readStoredMap(storageKey)[presetId] ?? support?.defaultModelId;
	if (!stored) return null;
	const resolvedStored = support?.modelAliases?.[stored] ?? stored;
	// Drop ids that fell out of the curated registry so a stale preference
	// cannot launch the CLI with an unsupported model.
	return support?.models.some((model) => model.id === resolvedStored)
		? resolvedStored
		: null;
}

/**
 * Last-selected model per agent preset, persisted as a JSON map in
 * localStorage. Keyed by presetId (not config UUID) so the preference
 * survives host switches and agent-config re-creation. Catalogs with an
 * explicit default select it immediately; `null` omits the model flag for
 * agents that still expose a synthetic default choice.
 */
export function useAgentModelPreference(
	storageKey: string,
	presetId: string | null,
	supportOverride?: AgentModelSupport,
) {
	const [selectedModel, setSelectedModelState] = useState<string | null>(() =>
		readStoredModel(storageKey, presetId, supportOverride),
	);

	useEffect(() => {
		setSelectedModelState(
			readStoredModel(storageKey, presetId, supportOverride),
		);
	}, [storageKey, presetId, supportOverride]);

	const setSelectedModel = useCallback(
		(model: string | null) => {
			if (!presetId) return;
			setSelectedModelState(model);
			if (typeof window === "undefined") return;
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

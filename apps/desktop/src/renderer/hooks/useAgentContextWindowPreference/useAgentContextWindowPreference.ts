import {
	type AgentContextWindowSupport,
	getAgentContextWindowSupport,
} from "@superset/shared/agent-models";
import { useCallback, useEffect, useState } from "react";

function readStoredMap(storageKey: string): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(storageKey);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (
			parsed === null ||
			typeof parsed !== "object" ||
			Array.isArray(parsed)
		) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}

function readStoredContextWindow(
	storageKey: string,
	presetId: string | null,
	model: string | null,
	supportOverride?: AgentContextWindowSupport,
): string | null {
	if (!presetId || !model) return null;
	const support =
		supportOverride ?? getAgentContextWindowSupport(presetId, model);
	if (!support) return null;
	const stored =
		readStoredMap(storageKey)[`${presetId}:${model}`] ??
		support.defaultContextWindowId;
	return support.contextWindows.some((option) => option.id === stored)
		? stored
		: support.defaultContextWindowId;
}

export function useAgentContextWindowPreference(
	storageKey: string,
	presetId: string | null,
	model: string | null,
	supportOverride?: AgentContextWindowSupport,
) {
	const [selectedContextWindow, setSelectedContextWindowState] = useState<
		string | null
	>(() =>
		readStoredContextWindow(storageKey, presetId, model, supportOverride),
	);

	useEffect(() => {
		setSelectedContextWindowState(
			readStoredContextWindow(storageKey, presetId, model, supportOverride),
		);
	}, [storageKey, presetId, model, supportOverride]);

	const setSelectedContextWindow = useCallback(
		(contextWindow: string | null) => {
			setSelectedContextWindowState(contextWindow);
			if (typeof window === "undefined" || !presetId || !model) {
				return;
			}
			const map = readStoredMap(storageKey);
			const preferenceKey = `${presetId}:${model}`;
			if (contextWindow) map[preferenceKey] = contextWindow;
			else delete map[preferenceKey];
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(map));
			} catch {
				// The active selection still applies when persistence is unavailable.
			}
		},
		[storageKey, presetId, model],
	);

	return { selectedContextWindow, setSelectedContextWindow };
}

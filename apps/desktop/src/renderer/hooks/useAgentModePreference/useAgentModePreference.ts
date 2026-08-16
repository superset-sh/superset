import {
	type AgentModeSupport,
	getAgentModeSupport,
} from "@superset/shared/agent-models";
import { useCallback, useEffect, useState } from "react";

function readStoredMap(storageKey: string): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
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

function readStoredMode(
	storageKey: string,
	presetId: string | null,
	supportOverride?: AgentModeSupport,
	preferenceScope?: string | null,
): string | null {
	if (!presetId) return null;
	const support = supportOverride ?? getAgentModeSupport(presetId);
	const preferenceKey = preferenceScope
		? `${presetId}:${preferenceScope}`
		: presetId;
	const stored = readStoredMap(storageKey)[preferenceKey];
	return support?.modes.some((mode) => mode.id === stored) ? stored : null;
}

export function useAgentModePreference(
	storageKey: string,
	presetId: string | null,
	supportOverride?: AgentModeSupport,
	preferenceScope?: string | null,
) {
	const [selectedMode, setSelectedModeState] = useState<string | null>(() =>
		readStoredMode(storageKey, presetId, supportOverride, preferenceScope),
	);

	useEffect(() => {
		setSelectedModeState(
			readStoredMode(storageKey, presetId, supportOverride, preferenceScope),
		);
	}, [storageKey, presetId, supportOverride, preferenceScope]);

	const setSelectedMode = useCallback(
		(mode: string | null) => {
			setSelectedModeState(mode);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			const preferenceKey = preferenceScope
				? `${presetId}:${preferenceScope}`
				: presetId;
			if (mode) map[preferenceKey] = mode;
			else delete map[preferenceKey];
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(map));
			} catch {
				// The active selection still applies when persistence is unavailable.
			}
		},
		[storageKey, presetId, preferenceScope],
	);

	return { selectedMode, setSelectedMode };
}

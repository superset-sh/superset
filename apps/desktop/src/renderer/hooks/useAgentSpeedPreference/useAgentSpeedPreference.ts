import {
	type AgentSpeedSupport,
	getAgentSpeedSupport,
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

function readStoredSpeed(
	storageKey: string,
	presetId: string | null,
	model: string | null,
	supportOverride?: AgentSpeedSupport,
): string | null {
	if (!presetId) return null;
	const support = supportOverride ?? getAgentSpeedSupport(presetId, model);
	if (!support) return null;
	const preferenceKey = model ? `${presetId}:${model}` : presetId;
	const stored =
		readStoredMap(storageKey)[preferenceKey] ?? support.defaultSpeedId;
	return support.speeds.some((speed) => speed.id === stored)
		? (stored ?? null)
		: (support.defaultSpeedId ?? null);
}

export function useAgentSpeedPreference(
	storageKey: string,
	presetId: string | null,
	model: string | null,
	supportOverride?: AgentSpeedSupport,
) {
	const [selectedSpeed, setSelectedSpeedState] = useState<string | null>(() =>
		readStoredSpeed(storageKey, presetId, model, supportOverride),
	);

	useEffect(() => {
		setSelectedSpeedState(
			readStoredSpeed(storageKey, presetId, model, supportOverride),
		);
	}, [storageKey, presetId, model, supportOverride]);

	const setSelectedSpeed = useCallback(
		(speed: string | null) => {
			setSelectedSpeedState(speed);
			if (typeof window === "undefined" || !presetId) return;
			const map = readStoredMap(storageKey);
			const preferenceKey = model ? `${presetId}:${model}` : presetId;
			if (speed) map[preferenceKey] = speed;
			else delete map[preferenceKey];
			try {
				window.localStorage.setItem(storageKey, JSON.stringify(map));
			} catch {
				// The active selection still applies when persistence is unavailable.
			}
		},
		[storageKey, presetId, model],
	);

	return { selectedSpeed, setSelectedSpeed };
}

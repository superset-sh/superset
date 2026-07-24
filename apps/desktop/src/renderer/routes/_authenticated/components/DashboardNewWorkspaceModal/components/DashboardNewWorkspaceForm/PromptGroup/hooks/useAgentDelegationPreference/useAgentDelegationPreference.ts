import type { AgentDelegationMode } from "@superset/shared/agent-delegation";
import { useCallback, useState } from "react";

const STORAGE_KEY = "workspaceAgentDelegationMode";

interface AgentDelegationPreferenceStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function readAgentDelegationPreference(
	storage: AgentDelegationPreferenceStorage | null,
): AgentDelegationMode {
	return storage?.getItem(STORAGE_KEY) === "workspaces"
		? "workspaces"
		: "native";
}

export function writeAgentDelegationPreference(
	storage: AgentDelegationPreferenceStorage,
	mode: AgentDelegationMode,
): void {
	storage.setItem(STORAGE_KEY, mode);
}

export function useAgentDelegationPreference() {
	const [delegationMode, setDelegationModeState] =
		useState<AgentDelegationMode>(() =>
			readAgentDelegationPreference(
				typeof window === "undefined" ? null : window.localStorage,
			),
		);

	const setDelegationMode = useCallback((mode: AgentDelegationMode) => {
		setDelegationModeState(mode);
		writeAgentDelegationPreference(window.localStorage, mode);
	}, []);

	return { delegationMode, setDelegationMode };
}

import type { AgentDelegationMode } from "@superset/shared/agent-delegation";
import { useCallback, useState } from "react";

const STORAGE_KEY = "workspaceAgentDelegationMode";

interface AgentDelegationPreferenceStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** Read the persisted delegation mode, defaulting invalid values to native. */
export function readAgentDelegationPreference(
	storage: AgentDelegationPreferenceStorage | null,
): AgentDelegationMode {
	return storage?.getItem(STORAGE_KEY) === "workspaces"
		? "workspaces"
		: "native";
}

/** Persist the selected delegation mode for future workspace creation. */
export function writeAgentDelegationPreference(
	storage: AgentDelegationPreferenceStorage,
	mode: AgentDelegationMode,
): void {
	storage.setItem(STORAGE_KEY, mode);
}

/** Manage the persisted delegation mode used by the new-workspace form. */
export function useAgentDelegationPreference() {
	const [delegationMode, setDelegationModeState] =
		useState<AgentDelegationMode>(() =>
			readAgentDelegationPreference(
				typeof window === "undefined" ? null : window.localStorage,
			),
		);

	/** Update both React state and the browser preference. */
	const setDelegationMode = useCallback((mode: AgentDelegationMode) => {
		setDelegationModeState(mode);
		writeAgentDelegationPreference(window.localStorage, mode);
	}, []);

	return { delegationMode, setDelegationMode };
}

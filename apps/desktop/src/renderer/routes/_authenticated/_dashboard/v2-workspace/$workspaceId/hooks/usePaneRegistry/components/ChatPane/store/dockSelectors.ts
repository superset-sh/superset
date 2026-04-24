/**
 * Selectors over ChatStoreData.docks[sessionID]. Provides a stable empty
 * DockState for sessions that haven't had a dock event yet, so React
 * memo / shallow equality works.
 */

import type { ChatStoreData, DockState } from "./chatStore.logic";

const EMPTY_DOCKS: DockState = {
	todos: [],
	followup: [],
	followupPaused: false,
};

export function selectDocks(
	state: ChatStoreData,
	sessionID: string,
): DockState {
	return state.docks[sessionID] ?? EMPTY_DOCKS;
}

import { useCallback } from "react";
import { useUserPreferences } from "renderer/hooks/useUserPreferences";
import type { ModifierEvent } from "../types";
import {
	type FolderIntent,
	type FolderTierMap,
	folderIntentForMap,
} from "./folderPolicy";

export interface FolderClickPolicy {
	getIntent: (event: ModifierEvent) => FolderIntent;
	map: FolderTierMap;
}

/** Settings-driven click policy for folder links in terminal output. */
export function useTerminalFolderPolicy(): FolderClickPolicy {
	const { preferences } = useUserPreferences();
	const map = preferences.folderLinks;
	const getIntent = useCallback(
		(event: ModifierEvent) => folderIntentForMap(event, map),
		[map],
	);
	return { getIntent, map };
}

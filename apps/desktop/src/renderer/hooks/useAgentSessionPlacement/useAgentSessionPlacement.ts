import { useSyncExternalStore } from "react";

export type AgentSessionPlacement = "split-pane" | "new-tab";
const STORAGE_KEY = "lastSelectedDiffCommentPlacement";
const CHANGE_EVENT = "agent-session-placement-changed";

function getSnapshot(): AgentSessionPlacement {
	return window.localStorage.getItem(STORAGE_KEY) === "new-tab"
		? "new-tab"
		: "split-pane";
}

function subscribe(onChange: () => void) {
	const onStorage = (event: StorageEvent) => {
		if (event.key === STORAGE_KEY || event.key === null) onChange();
	};
	window.addEventListener(CHANGE_EVENT, onChange);
	window.addEventListener("storage", onStorage);
	return () => {
		window.removeEventListener(CHANGE_EVENT, onChange);
		window.removeEventListener("storage", onStorage);
	};
}

export function setAgentSessionPlacement(placement: string) {
	if (placement !== "split-pane" && placement !== "new-tab") return;
	window.localStorage.setItem(STORAGE_KEY, placement);
	window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAgentSessionPlacement(): AgentSessionPlacement {
	return useSyncExternalStore(subscribe, getSnapshot, () => "split-pane");
}

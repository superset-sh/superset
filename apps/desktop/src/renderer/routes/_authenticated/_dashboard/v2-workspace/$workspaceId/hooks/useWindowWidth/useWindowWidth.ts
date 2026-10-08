import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
	window.addEventListener("resize", callback);
	return () => window.removeEventListener("resize", callback);
}

function getWidth(): number {
	return window.innerWidth;
}

export function useWindowWidth(): number {
	return useSyncExternalStore(subscribe, getWidth);
}

import { useLocation } from "@tanstack/react-router";
import { useRef } from "react";
import { persistentHistory } from "renderer/lib/persistent-hash-history";

export interface RecentlyViewedEntry {
	path: string;
	type: "workspace" | "task";
	entityId: string;
	timestamp: number;
}

function parseResourceEntry(entry: {
	path: string;
	timestamp: number;
}): RecentlyViewedEntry | null {
	const wsMatch = entry.path.match(/^\/workspace\/(.+)$/);
	if (wsMatch?.[1])
		return {
			path: entry.path,
			type: "workspace",
			entityId: wsMatch[1],
			timestamp: entry.timestamp,
		};
	const taskMatch = entry.path.match(/^\/tasks\/(.+)$/);
	if (taskMatch?.[1])
		return {
			path: entry.path,
			type: "task",
			entityId: taskMatch[1],
			timestamp: entry.timestamp,
		};
	return null;
}

export function useRecentlyViewed(limit = 20): RecentlyViewedEntry[] {
	useLocation(); // re-render on route change
	const prevRef = useRef<RecentlyViewedEntry[]>([]);

	const allEntries = persistentHistory.getEntries();
	const seen = new Map<string, RecentlyViewedEntry>();

	for (let i = allEntries.length - 1; i >= 0; i--) {
		const entry = allEntries[i];
		if (!entry || seen.has(entry.path)) continue;
		const resource = parseResourceEntry(entry);
		if (resource) {
			seen.set(entry.path, resource);
		}
	}

	const next = Array.from(seen.values()).slice(0, limit);
	const prev = prevRef.current;

	if (
		prev.length === next.length &&
		prev.every((e, i) => e.path === next[i]?.path)
	) {
		return prev;
	}

	prevRef.current = next;
	return next;
}

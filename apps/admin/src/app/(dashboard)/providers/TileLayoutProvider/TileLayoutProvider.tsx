"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import type { Layout } from "react-grid-layout";

// Bump the version when the grid's units change: heights saved in the old
// unit would draw at the wrong size, so a reset is the right outcome then.
// Sections are namespaced within it.
const STORAGE_PREFIX = "admin.tile-layout.v2.";

interface TileLayout {
	// Bumped on reset so every grid re-reads its default layout.
	version: number;
	readLayout: (section: string) => Layout | null;
	writeLayout: (section: string, layout: Layout) => void;
	resetLayouts: () => void;
}

const TileLayoutContext = createContext<TileLayout | null>(null);

// Tile positions and sizes live in this browser only. These are pages a couple
// of people arrange for themselves, not a shared document.
export function TileLayoutProvider({ children }: { children: ReactNode }) {
	const [version, setVersion] = useState(0);

	const readLayout = useCallback((section: string): Layout | null => {
		try {
			const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${section}`);
			return raw ? (JSON.parse(raw) as Layout) : null;
		} catch {
			return null;
		}
	}, []);

	const writeLayout = useCallback((section: string, layout: Layout) => {
		try {
			window.localStorage.setItem(
				`${STORAGE_PREFIX}${section}`,
				JSON.stringify(layout),
			);
		} catch {
			// Nothing to persist to; the arrangement lasts for this visit.
		}
	}, []);

	const resetLayouts = useCallback(() => {
		try {
			const keys = Object.keys(window.localStorage).filter((key) =>
				key.startsWith(STORAGE_PREFIX),
			);
			for (const key of keys) window.localStorage.removeItem(key);
		} catch {
			// Fall through: the version bump still restores defaults on screen.
		}
		setVersion((v) => v + 1);
	}, []);

	const value = useMemo(
		() => ({ version, readLayout, writeLayout, resetLayouts }),
		[version, readLayout, writeLayout, resetLayouts],
	);

	return (
		<TileLayoutContext.Provider value={value}>
			{children}
		</TileLayoutContext.Provider>
	);
}

export function useTileLayout(): TileLayout {
	const context = useContext(TileLayoutContext);
	if (!context) {
		throw new Error("useTileLayout needs TileLayoutProvider");
	}
	return context;
}

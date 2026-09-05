"use client";

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export const RANGE_WEEKS = [4, 12, 26] as const;
export type RangeWeeks = (typeof RANGE_WEEKS)[number];

const STORAGE_KEY = "admin.growth.weeks";
const DEFAULT_WEEKS: RangeWeeks = 12;

interface GrowthRange {
	weeks: RangeWeeks;
	// Tables of "top N" rows use a day window matching the chart horizon.
	days: number;
	setWeeks: (weeks: RangeWeeks) => void;
}

const GrowthRangeContext = createContext<GrowthRange | null>(null);

function isRangeWeeks(value: number): value is RangeWeeks {
	return (RANGE_WEEKS as readonly number[]).includes(value);
}

// One time horizon for the whole page, remembered per browser, so every tile
// answers the same question instead of each carrying its own picker.
export function GrowthRangeProvider({ children }: { children: ReactNode }) {
	const [weeks, setWeeksState] = useState<RangeWeeks>(DEFAULT_WEEKS);

	useEffect(() => {
		try {
			const stored = Number(window.localStorage.getItem(STORAGE_KEY));
			if (isRangeWeeks(stored)) setWeeksState(stored);
		} catch {
			// Storage can be unavailable; the default horizon still works.
		}
	}, []);

	const setWeeks = useCallback((next: RangeWeeks) => {
		setWeeksState(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, String(next));
		} catch {
			// Same as above: nothing to do when storage is blocked.
		}
	}, []);

	const value = useMemo(
		() => ({ weeks, days: weeks * 7, setWeeks }),
		[weeks, setWeeks],
	);

	return (
		<GrowthRangeContext.Provider value={value}>
			{children}
		</GrowthRangeContext.Provider>
	);
}

export function useGrowthRange(): GrowthRange {
	const context = useContext(GrowthRangeContext);
	if (!context) {
		throw new Error("useGrowthRange needs GrowthRangeProvider");
	}
	return context;
}

import { useCallback, useEffect, useRef } from "react";

interface DebouncedSearchNavigation {
	cancelPendingSearchNavigation: () => void;
	scheduleSearchNavigation: (query: string) => void;
}

export function useDebouncedSearchNavigation(
	navigateSearch: (query: string) => void,
	delay = 300,
): DebouncedSearchNavigation {
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);
	const navigateSearchRef = useRef(navigateSearch);
	navigateSearchRef.current = navigateSearch;

	const cancelPendingSearchNavigation = useCallback(() => {
		if (!timeoutRef.current) return;
		clearTimeout(timeoutRef.current);
		timeoutRef.current = null;
	}, []);

	const scheduleSearchNavigation = useCallback(
		(query: string) => {
			cancelPendingSearchNavigation();
			timeoutRef.current = setTimeout(() => {
				timeoutRef.current = null;
				navigateSearchRef.current(query);
			}, delay);
		},
		[cancelPendingSearchNavigation, delay],
	);

	useEffect(
		() => cancelPendingSearchNavigation,
		[cancelPendingSearchNavigation],
	);

	return {
		cancelPendingSearchNavigation,
		scheduleSearchNavigation,
	};
}

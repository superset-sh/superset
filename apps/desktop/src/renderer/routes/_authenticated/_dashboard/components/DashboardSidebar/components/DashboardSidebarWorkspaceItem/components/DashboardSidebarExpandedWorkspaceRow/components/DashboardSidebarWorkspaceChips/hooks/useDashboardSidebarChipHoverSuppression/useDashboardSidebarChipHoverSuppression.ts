import { useCallback, useEffect, useRef } from "react";
import { useDashboardSidebarHover } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider";

interface UseDashboardSidebarChipHoverSuppressionResult {
	hold: () => void;
	release: () => void;
}

/**
 * Ref-counted hold on the sidebar's workspace hover card while a chip (or its
 * own hover card) has the pointer. Holds still owned on unmount are released
 * automatically — a chip can disappear mid-hover after a bulk close.
 */
export function useDashboardSidebarChipHoverSuppression(): UseDashboardSidebarChipHoverSuppressionResult {
	const { beginHoverCardSuppression, endHoverCardSuppression } =
		useDashboardSidebarHover();
	const holdsRef = useRef(0);

	const hold = useCallback(() => {
		holdsRef.current += 1;
		beginHoverCardSuppression();
	}, [beginHoverCardSuppression]);

	const release = useCallback(() => {
		if (holdsRef.current === 0) return;
		holdsRef.current -= 1;
		endHoverCardSuppression();
	}, [endHoverCardSuppression]);

	useEffect(
		() => () => {
			while (holdsRef.current > 0) {
				holdsRef.current -= 1;
				endHoverCardSuppression();
			}
		},
		[endHoverCardSuppression],
	);

	return { hold, release };
}

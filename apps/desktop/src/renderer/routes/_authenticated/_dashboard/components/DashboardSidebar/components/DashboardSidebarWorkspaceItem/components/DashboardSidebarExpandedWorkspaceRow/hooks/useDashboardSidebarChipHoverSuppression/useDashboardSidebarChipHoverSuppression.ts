import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardSidebarHoverActions } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider";

interface UseDashboardSidebarChipHoverSuppressionResult {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onPointerLeave: () => void;
	toggleOpen: () => void;
}

/**
 * Controls a chip's hover card and holds the sidebar's workspace hover card
 * while the chip's card is open. A hold still owned on unmount is released
 * automatically — a chip can disappear mid-hover after a bulk close.
 */
export function useDashboardSidebarChipHoverSuppression(): UseDashboardSidebarChipHoverSuppressionResult {
	const { beginHoverCardSuppression, endHoverCardSuppression } =
		useDashboardSidebarHoverActions();
	const isOpenRef = useRef(false);
	const dismissedByClickRef = useRef(false);
	const [isOpen, setIsOpen] = useState(false);

	const onOpenChange = useCallback(
		(open: boolean) => {
			// A pending hover-open timer can fire after the user clicks to close.
			// Keep the card dismissed until the pointer leaves or it is clicked again.
			if (open && dismissedByClickRef.current) return;
			if (isOpenRef.current === open) return;

			isOpenRef.current = open;
			setIsOpen(open);
			if (open) {
				beginHoverCardSuppression();
			} else {
				endHoverCardSuppression();
			}
		},
		[beginHoverCardSuppression, endHoverCardSuppression],
	);

	const onPointerLeave = useCallback(() => {
		dismissedByClickRef.current = false;
	}, []);

	const toggleOpen = useCallback(() => {
		const nextOpen = !isOpenRef.current;
		dismissedByClickRef.current = !nextOpen;
		onOpenChange(nextOpen);
	}, [onOpenChange]);

	useEffect(
		() => () => {
			if (isOpenRef.current) endHoverCardSuppression();
		},
		[endHoverCardSuppression],
	);

	return {
		isOpen,
		onOpenChange,
		onPointerLeave,
		toggleOpen,
	};
}

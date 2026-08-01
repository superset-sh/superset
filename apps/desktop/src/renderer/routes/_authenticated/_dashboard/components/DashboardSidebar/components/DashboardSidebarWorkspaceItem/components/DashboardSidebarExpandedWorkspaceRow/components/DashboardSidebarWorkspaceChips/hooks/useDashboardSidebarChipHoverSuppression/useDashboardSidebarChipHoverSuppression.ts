import { useCallback, useEffect, useRef, useState } from "react";
import { useDashboardSidebarHover } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarHoverProvider";

interface UseDashboardSidebarChipHoverSuppressionResult {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onPointerEnter: () => void;
	onPointerLeave: () => void;
	toggleOpen: () => void;
}

/**
 * Controls a chip's hover card and keeps a ref-counted hold on the sidebar's
 * workspace hover card while the chip (or its card) is active. Holds still
 * owned on unmount are released automatically — a chip can disappear
 * mid-hover after a bulk close.
 */
export function useDashboardSidebarChipHoverSuppression(): UseDashboardSidebarChipHoverSuppressionResult {
	const { beginHoverCardSuppression, endHoverCardSuppression } =
		useDashboardSidebarHover();
	const holdsRef = useRef(0);
	const isOpenRef = useRef(false);
	const dismissedByClickRef = useRef(false);
	const [isOpen, setIsOpen] = useState(false);

	const hold = useCallback(() => {
		holdsRef.current += 1;
		beginHoverCardSuppression();
	}, [beginHoverCardSuppression]);

	const release = useCallback(() => {
		if (holdsRef.current === 0) return;
		holdsRef.current -= 1;
		endHoverCardSuppression();
	}, [endHoverCardSuppression]);

	const onOpenChange = useCallback(
		(open: boolean) => {
			// A pending hover-open timer can fire after the user clicks to close.
			// Keep the card dismissed until the pointer leaves or it is clicked again.
			if (open && dismissedByClickRef.current) return;
			if (isOpenRef.current === open) return;

			isOpenRef.current = open;
			setIsOpen(open);
			if (open) {
				hold();
			} else {
				release();
			}
		},
		[hold, release],
	);

	const onPointerEnter = useCallback(() => {
		// Do not clear a click dismissal here. Removing the hover-card content can
		// produce another enter while the pointer is still over the trigger.
		hold();
	}, [hold]);

	const onPointerLeave = useCallback(() => {
		dismissedByClickRef.current = false;
		release();
	}, [release]);

	const toggleOpen = useCallback(() => {
		const nextOpen = !isOpenRef.current;
		dismissedByClickRef.current = !nextOpen;
		onOpenChange(nextOpen);
	}, [onOpenChange]);

	useEffect(
		() => () => {
			while (holdsRef.current > 0) {
				holdsRef.current -= 1;
				endHoverCardSuppression();
			}
		},
		[endHoverCardSuppression],
	);

	return {
		isOpen,
		onOpenChange,
		onPointerEnter,
		onPointerLeave,
		toggleOpen,
	};
}

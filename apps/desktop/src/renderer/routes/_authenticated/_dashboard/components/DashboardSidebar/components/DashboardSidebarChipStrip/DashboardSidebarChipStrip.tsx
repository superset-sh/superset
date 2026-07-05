import { OverflowFadeContainer } from "@superset/ui/overflow-fade-container";
import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

/** Must match the `gap-1.5` class on the container below. */
const CHIP_GAP_PX = 6;

interface DashboardSidebarChipStripProps {
	className?: string;
	children: ReactNode;
}

/**
 * Strip of chips (ports, agents) that stays a single row while everything
 * fits, wraps into a two-row grid once it doesn't, and scrolls horizontally
 * (two rows deep) beyond that.
 *
 * Layout is chosen by comparing the chips' natural widths against the
 * container, re-measured on every render and on container resizes. Pure-CSS
 * child growth (e.g. a chip revealing hover actions) deliberately doesn't
 * trigger a re-measure, so hovering can't flip the layout.
 */
export function DashboardSidebarChipStrip({
	className,
	children,
}: DashboardSidebarChipStripProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isTwoRows, setIsTwoRows] = useState(false);

	const measure = useCallback(() => {
		const node = containerRef.current;
		if (!node) return;
		const styles = getComputedStyle(node);
		const available =
			node.clientWidth -
			Number.parseFloat(styles.paddingLeft) -
			Number.parseFloat(styles.paddingRight);
		let needed = -CHIP_GAP_PX;
		for (const child of Array.from(node.children)) {
			needed += (child as HTMLElement).offsetWidth + CHIP_GAP_PX;
		}
		setIsTwoRows(needed > available);
	}, []);

	// No dependency array: chips mounting/unmounting re-renders this component,
	// and re-measuring is cheap (setState bails when the boolean is unchanged).
	useLayoutEffect(measure);

	useLayoutEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [measure]);

	return (
		<OverflowFadeContainer
			ref={containerRef}
			observeChildren
			className={cn(
				// justify-items-start keeps chips at natural width in grid mode;
				// stretched chips would inflate the offsetWidths measure() sums.
				isTwoRows
					? "grid auto-cols-max grid-flow-col grid-rows-2 justify-items-start"
					: "flex",
				"items-center gap-1.5 overflow-x-auto hide-scrollbar",
				className,
			)}
		>
			{children}
		</OverflowFadeContainer>
	);
}

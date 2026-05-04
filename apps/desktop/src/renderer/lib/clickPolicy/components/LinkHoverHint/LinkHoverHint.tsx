import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { UNBOUND_HINT } from "../../hint";

const TOOLTIP_OFFSET_PX = 14;
const TOOLTIP_CLASSES =
	"pointer-events-none fixed z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background";

interface Position {
	clientX: number;
	clientY: number;
}

interface LinkHoverHintProps {
	/** What would clicking right now do, given current modifiers. Null to hide. */
	hoverLabel: string | null;
	hoverPosition: Position | null;
	/** Transient "click did nothing — here's the bind" hint. Hidden when hover is showing. */
	clickHint: Position | null;
}

/**
 * Pure presentational tooltip used by terminal-style link surfaces. Rendered
 * via portal so it can escape clipped/scrolled ancestors. Two modes:
 *
 * - `hoverLabel` shown while a link is hovered with a held modifier (what
 *   pressing now would do). Caller resolves the label via a policy hook +
 *   the actionLabel helper.
 * - `clickHint` flashes when the user plain-clicks a link bound to null,
 *   nudging them toward Settings → Links.
 */
export function LinkHoverHint({
	hoverLabel,
	hoverPosition,
	clickHint,
}: LinkHoverHintProps) {
	const showingHover = hoverLabel !== null && hoverPosition !== null;
	return createPortal(
		<>
			{showingHover && hoverPosition && (
				<div
					className={TOOLTIP_CLASSES}
					style={{
						left: hoverPosition.clientX + TOOLTIP_OFFSET_PX,
						top: hoverPosition.clientY + TOOLTIP_OFFSET_PX,
					}}
				>
					{hoverLabel}
				</div>
			)}
			<AnimatePresence>
				{clickHint && !showingHover && (
					<motion.div
						key="hint"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className={TOOLTIP_CLASSES}
						style={{
							left: clickHint.clientX + TOOLTIP_OFFSET_PX,
							top: clickHint.clientY + TOOLTIP_OFFSET_PX,
						}}
					>
						{UNBOUND_HINT}
					</motion.div>
				)}
			</AnimatePresence>
		</>,
		document.body,
	);
}

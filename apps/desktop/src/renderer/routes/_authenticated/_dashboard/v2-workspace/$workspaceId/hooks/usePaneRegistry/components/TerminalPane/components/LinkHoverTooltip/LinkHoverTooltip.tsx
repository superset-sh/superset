import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";
import type {
	LinkAction,
	LinkTier,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { LinkClickHint } from "../../hooks/useLinkClickHint";
import type { HoveredLink } from "../../hooks/useLinkHoverState";

const TOOLTIP_OFFSET_PX = 14;
const TOOLTIP_CLASSES =
	"pointer-events-none fixed z-50 w-fit rounded-md bg-foreground px-3 py-1.5 text-xs text-background";

const HINT_LABEL = "Not bound · configure in Settings → Links";

function tierFor(modifier: boolean, shift: boolean): LinkTier {
	if (modifier) return shift ? "metaShift" : "meta";
	return "plain";
}

function labelForFile(action: LinkAction | null): string | null {
	if (action === null) return null;
	return action === "external"
		? "Open in external editor"
		: "Open in file viewer";
}

function labelForUrl(action: LinkAction | null): string | null {
	if (action === null) return null;
	return action === "external" ? "Open in system browser" : "Open in browser";
}

function labelForHover(
	info: LinkHoverInfo,
	tier: LinkTier,
	fileAction: LinkAction | null,
	urlAction: LinkAction | null,
): string | null {
	if (info.kind === "url") return labelForUrl(urlAction);
	// Folder click behavior is hardcoded, not settings-driven:
	// ⌘ reveals in sidebar, ⌘⇧ opens in external editor, plain = hint.
	if (info.isDirectory) {
		if (tier === "plain") return null;
		return tier === "metaShift" ? "Open in editor" : "Reveal in sidebar";
	}
	return labelForFile(fileAction);
}

interface LinkHoverTooltipProps {
	hoveredLink: HoveredLink | null;
	hint: LinkClickHint | null;
}

export function LinkHoverTooltip({ hoveredLink, hint }: LinkHoverTooltipProps) {
	const { preferences } = useV2UserPreferences();

	// Only surface the hover tooltip when a modifier is held — matches the
	// original intent of "here's what pressing this will do". For unbound
	// tiers the label resolves to null, so the tooltip stays hidden.
	const tier = hoveredLink?.modifier
		? tierFor(hoveredLink.modifier, hoveredLink.shift)
		: null;
	const hoverLabel =
		hoveredLink && tier
			? labelForHover(
					hoveredLink.info,
					tier,
					preferences.fileLinks[tier],
					preferences.urlLinks[tier],
				)
			: null;
	const showingHover = hoverLabel !== null;

	return createPortal(
		<>
			{hoveredLink && showingHover && (
				<div
					className={TOOLTIP_CLASSES}
					style={{
						left: hoveredLink.clientX + TOOLTIP_OFFSET_PX,
						top: hoveredLink.clientY + TOOLTIP_OFFSET_PX,
					}}
				>
					{hoverLabel}
				</div>
			)}
			<AnimatePresence>
				{hint && !showingHover && (
					<motion.div
						key="hint"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className={TOOLTIP_CLASSES}
						style={{
							left: hint.clientX + TOOLTIP_OFFSET_PX,
							top: hint.clientY + TOOLTIP_OFFSET_PX,
						}}
					>
						{HINT_LABEL}
					</motion.div>
				)}
			</AnimatePresence>
		</>,
		document.body,
	);
}

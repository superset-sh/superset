import { useCallback, useEffect, useState } from "react";
import type { LinkHoverInfo } from "renderer/lib/terminal/terminal-runtime-registry";

export interface HoveredLink {
	clientX: number;
	clientY: number;
	info: LinkHoverInfo;
	modifier: boolean;
	shift: boolean;
}

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt"]);

export function useLinkHoverState() {
	const [hoveredLink, setHoveredLink] = useState<HoveredLink | null>(null);
	const hovering = hoveredLink !== null;

	useEffect(() => {
		if (!hovering) return;
		const update = (event: KeyboardEvent) => {
			if (!MODIFIER_KEYS.has(event.key)) return;
			setHoveredLink((prev) => {
				if (!prev) return null;
				const nextModifier = event.metaKey || event.ctrlKey;
				const nextShift = event.shiftKey;
				if (prev.modifier === nextModifier && prev.shift === nextShift) {
					return prev;
				}
				return { ...prev, modifier: nextModifier, shift: nextShift };
			});
		};
		window.addEventListener("keydown", update);
		window.addEventListener("keyup", update);
		return () => {
			window.removeEventListener("keydown", update);
			window.removeEventListener("keyup", update);
		};
	}, [hovering]);

	const onHover = useCallback((event: MouseEvent, info: LinkHoverInfo) => {
		setHoveredLink({
			clientX: event.clientX,
			clientY: event.clientY,
			info,
			modifier: event.metaKey || event.ctrlKey,
			shift: event.shiftKey,
		});
	}, []);

	const onLeave = useCallback(() => {
		setHoveredLink(null);
	}, []);

	return { hoveredLink, onHover, onLeave };
}

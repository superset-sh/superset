import { useCallback, useEffect, useRef, useState } from "react";
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

	// xterm's Linkifier caches the last real MouseEvent and re-fires
	// leave + hover(cachedEvent) on every terminal render tick. The replayed
	// object carries the modifier flags from the last physical mouse move, so
	// reading flags off every hover event would keep stomping key-driven
	// updates (hold ⌘, add ⇧ → tooltip stuck on the ⌘ label). Flags therefore
	// live in a ref owned by the key listener; hover events only seed them
	// when the event object is genuinely new (a real pointer move).
	const flagsRef = useRef({ modifier: false, shift: false });
	const lastMouseEventRef = useRef<MouseEvent | null>(null);

	useEffect(() => {
		if (!hovering) return;
		const update = (event: KeyboardEvent) => {
			if (!MODIFIER_KEYS.has(event.key)) return;
			flagsRef.current = {
				modifier: event.metaKey || event.ctrlKey,
				shift: event.shiftKey,
			};
			setHoveredLink((prev) => {
				if (!prev) return null;
				const { modifier, shift } = flagsRef.current;
				if (prev.modifier === modifier && prev.shift === shift) {
					return prev;
				}
				return { ...prev, modifier, shift };
			});
		};
		// Capture phase: xterm's key handling on the focused textarea can stop
		// propagation, which would starve a bubble-phase window listener.
		window.addEventListener("keydown", update, true);
		window.addEventListener("keyup", update, true);
		return () => {
			window.removeEventListener("keydown", update, true);
			window.removeEventListener("keyup", update, true);
		};
	}, [hovering]);

	const onHover = useCallback((event: MouseEvent, info: LinkHoverInfo) => {
		// Same object as last time → xterm replaying its cached event; keep the
		// key-listener-owned flags instead of the event's stale ones.
		if (lastMouseEventRef.current !== event) {
			lastMouseEventRef.current = event;
			flagsRef.current = {
				modifier: event.metaKey || event.ctrlKey,
				shift: event.shiftKey,
			};
		}
		setHoveredLink({
			clientX: event.clientX,
			clientY: event.clientY,
			info,
			modifier: flagsRef.current.modifier,
			shift: flagsRef.current.shift,
		});
	}, []);

	const onLeave = useCallback(() => {
		setHoveredLink(null);
	}, []);

	return { hoveredLink, onHover, onLeave };
}

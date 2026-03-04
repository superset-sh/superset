import type { Terminal as XTerm } from "@xterm/xterm";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { scrollToBottom } from "../utils";

export interface UseTerminalHotkeysOptions {
	isFocused: boolean;
	xtermRef: MutableRefObject<XTerm | null>;
}

export interface UseTerminalHotkeysReturn {
	isSearchOpen: boolean;
	setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
}

export function useTerminalHotkeys({
	isFocused,
	xtermRef,
}: UseTerminalHotkeysOptions): UseTerminalHotkeysReturn {
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		if (isFocused) {
			xterm.focus();
		}
	}, [isFocused, xtermRef]);

	useAppHotkey(
		"FIND_IN_TERMINAL",
		() => setIsSearchOpen((prev) => !prev),
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	useAppHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			if (xtermRef.current) {
				scrollToBottom(xtermRef.current);
			}
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	return { isSearchOpen, setIsSearchOpen };
}

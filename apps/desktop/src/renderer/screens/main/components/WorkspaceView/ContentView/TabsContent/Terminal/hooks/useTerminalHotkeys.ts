import type { Terminal as XTerm } from "ghostty-web";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { scrollToBottom } from "../utils";

export interface UseTerminalHotkeysOptions {
	isFocused: boolean;
	xtermRef: MutableRefObject<XTerm | null>;
	supportsSearch?: boolean;
}

export interface UseTerminalHotkeysReturn {
	isSearchOpen: boolean;
	setIsSearchOpen: Dispatch<SetStateAction<boolean>>;
}

export function useTerminalHotkeys({
	isFocused,
	xtermRef,
	supportsSearch = true,
}: UseTerminalHotkeysOptions): UseTerminalHotkeysReturn {
	const [isSearchOpen, setIsSearchOpen] = useState(false);

	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	useAppHotkey(
		"FIND_IN_TERMINAL",
		() => setIsSearchOpen((prev) => !prev),
		{ enabled: isFocused && supportsSearch, preventDefault: true },
		[isFocused, supportsSearch],
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

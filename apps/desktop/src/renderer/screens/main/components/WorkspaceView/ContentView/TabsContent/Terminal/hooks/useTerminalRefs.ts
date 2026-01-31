import type { ITheme } from "@xterm/xterm";
import debounce from "lodash/debounce";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";

type DebouncedTitleSetter = ((tabId: string, title: string) => void) & {
	cancel?: () => void;
};

type RegisterCallback = (paneId: string, callback: () => void) => void;
type UnregisterCallback = (paneId: string) => void;

export interface UseTerminalRefsOptions {
	paneId: string;
	tabId: string;
	focusedPaneId: string | undefined;
	terminalTheme: ITheme | null;
	paneInitialCommands?: string[];
	paneInitialCwd?: string;
	clearPaneInitialData: (paneId: string) => void;
	workspaceCwd: string | null | undefined;
	handleFileLinkClick: (path: string, line?: number, column?: number) => void;
	setTabAutoTitle: (tabId: string, title: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export interface UseTerminalRefsReturn {
	isFocused: boolean;
	isFocusedRef: MutableRefObject<boolean>;
	initialThemeRef: MutableRefObject<ITheme | null>;
	paneInitialCommandsRef: MutableRefObject<string[] | undefined>;
	paneInitialCwdRef: MutableRefObject<string | undefined>;
	clearPaneInitialDataRef: MutableRefObject<(paneId: string) => void>;
	workspaceCwdRef: MutableRefObject<string | null>;
	handleFileLinkClickRef: MutableRefObject<
		(path: string, line?: number, column?: number) => void
	>;
	debouncedSetTabAutoTitleRef: MutableRefObject<DebouncedTitleSetter>;
	handleTerminalFocusRef: MutableRefObject<() => void>;
	registerClearCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterClearCallbackRef: MutableRefObject<UnregisterCallback>;
	registerScrollToBottomCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterScrollToBottomCallbackRef: MutableRefObject<UnregisterCallback>;
}

export function useTerminalRefs({
	paneId,
	tabId,
	focusedPaneId,
	terminalTheme,
	paneInitialCommands,
	paneInitialCwd,
	clearPaneInitialData,
	workspaceCwd,
	handleFileLinkClick,
	setTabAutoTitle,
	setFocusedPane,
}: UseTerminalRefsOptions): UseTerminalRefsReturn {
	const initialThemeRef = useRef(terminalTheme);
	const isFocused = focusedPaneId === paneId;
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	const paneInitialCommandsRef = useRef(paneInitialCommands);
	const paneInitialCwdRef = useRef(paneInitialCwd);
	const clearPaneInitialDataRef = useRef(clearPaneInitialData);
	paneInitialCommandsRef.current = paneInitialCommands;
	paneInitialCwdRef.current = paneInitialCwd;
	clearPaneInitialDataRef.current = clearPaneInitialData;

	const workspaceCwdRef = useRef<string | null>(workspaceCwd ?? null);
	workspaceCwdRef.current = workspaceCwd ?? null;

	const handleFileLinkClickRef = useRef(handleFileLinkClick);
	handleFileLinkClickRef.current = handleFileLinkClick;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((targetTabId: string, title: string) => {
			setTabAutoTitleRef.current(targetTabId, title);
		}, 100),
	);

	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		setFocusedPane(tabId, paneId);
	};

	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
	);
	const registerScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerScrollToBottomCallback,
	);
	const unregisterScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterScrollToBottomCallback,
	);

	return {
		isFocused,
		isFocusedRef,
		initialThemeRef,
		paneInitialCommandsRef,
		paneInitialCwdRef,
		clearPaneInitialDataRef,
		workspaceCwdRef,
		handleFileLinkClickRef,
		debouncedSetTabAutoTitleRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
	};
}

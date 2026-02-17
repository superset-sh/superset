import type { ITheme } from "@xterm/xterm";
import type { MutableRefObject } from "react";
import { useRef } from "react";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";

type RegisterCallback = (paneId: string, callback: () => void) => void;
type RegisterGetSelectionCallback = (
	paneId: string,
	callback: () => string,
) => void;
type RegisterPasteCallback = (
	paneId: string,
	callback: (text: string) => void,
) => void;
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
	setPaneName: (paneId: string, name: string) => void;
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
	setPaneNameRef: MutableRefObject<(paneId: string, name: string) => void>;
	handleTerminalFocusRef: MutableRefObject<() => void>;
	registerClearCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterClearCallbackRef: MutableRefObject<UnregisterCallback>;
	registerScrollToBottomCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterScrollToBottomCallbackRef: MutableRefObject<UnregisterCallback>;
	registerGetSelectionCallbackRef: MutableRefObject<RegisterGetSelectionCallback>;
	unregisterGetSelectionCallbackRef: MutableRefObject<UnregisterCallback>;
	registerPasteCallbackRef: MutableRefObject<RegisterPasteCallback>;
	unregisterPasteCallbackRef: MutableRefObject<UnregisterCallback>;
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
	setPaneName,
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

	const setPaneNameRef = useRef(setPaneName);
	setPaneNameRef.current = setPaneName;

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
	const registerGetSelectionCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerGetSelectionCallback,
	);
	const unregisterGetSelectionCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterGetSelectionCallback,
	);
	const registerPasteCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerPasteCallback,
	);
	const unregisterPasteCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterPasteCallback,
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
		setPaneNameRef,
		handleTerminalFocusRef,
		registerClearCallbackRef,
		unregisterClearCallbackRef,
		registerScrollToBottomCallbackRef,
		unregisterScrollToBottomCallbackRef,
		registerGetSelectionCallbackRef,
		unregisterGetSelectionCallbackRef,
		registerPasteCallbackRef,
		unregisterPasteCallbackRef,
	};
}

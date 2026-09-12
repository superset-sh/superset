/**
 * The pane's stream belongs to the first createOrAttach that succeeds.
 *
 * When the initial attach fails because the shell ran and died before it was
 * ready (SHELL_EXITED), the pane shows the exit and waits for a key instead of
 * looping through reconnects. The restart that key triggers is then the first
 * success, so it — not the initial path — has to start the cache-owned stream.
 * Skip that and the restarted shell has a session nobody is subscribed to: it
 * runs, and its output never reaches the pane.
 */
import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { MutableRefObject } from "react";
import type {
	CreateOrAttachCallbacks,
	CreateOrAttachInput,
	CreateOrAttachResult,
	TerminalStreamEvent,
} from "../types";
import type { UseTerminalLifecycleOptions } from "./useTerminalLifecycle";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { createParserIdleGate } = await import(
	"renderer/lib/terminal/parser-idle-gate"
);
const { waitForTerminalSessionReady } = await import(
	"renderer/lib/terminal/session-readiness"
);
const v1TerminalCache = await import("../v1-terminal-cache");
const { useTabsStore } = await import("renderer/stores/tabs/store");
const { useTerminalLifecycle } = await import("./useTerminalLifecycle");

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
	cleanup();
	for (const spy of spies) spy.mockRestore();
	spies.length = 0;
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * xterm needs a canvas to open, which happy-dom has none of. The lifecycle
 * effect only calls back into it for the members below.
 */
function createFakeXterm(): XTerm {
	const disposable = { dispose: () => {} };
	return {
		cols: 80,
		rows: 24,
		element: undefined,
		textarea: undefined,
		write: () => {},
		clear: () => {},
		focus: () => {},
		paste: () => {},
		getSelection: () => "",
		attachCustomKeyEventHandler: () => {},
		onData: () => disposable,
		onKey: () => disposable,
		onTitleChange: () => disposable,
		onRender: () => disposable,
	} as unknown as XTerm;
}

/** What the terminal router rejects with when the shell exited before ready. */
const SHELL_EXITED_ERROR = {
	message: "Your shell (/bin/zsh) exited immediately with code 1",
	data: {
		code: "PRECONDITION_FAILED",
		cause: {
			kind: "SHELL_EXITED",
			shell: "/bin/zsh",
			args: ["-l"],
			exitCode: 1,
			outputHead: "zsh: command not found: nvm\r\n",
		},
	},
};

/** Holds the callbacks of the in-flight createOrAttach so a test can answer it. */
function createAttachStub() {
	let pending: CreateOrAttachCallbacks | undefined;
	const inputs: CreateOrAttachInput[] = [];

	const mutate = (
		input: CreateOrAttachInput,
		callbacks?: CreateOrAttachCallbacks,
	) => {
		inputs.push(input);
		pending = callbacks;
	};

	const answer = (respond: (callbacks: CreateOrAttachCallbacks) => void) => {
		const callbacks = pending;
		if (!callbacks) throw new Error("no createOrAttach in flight");
		pending = undefined;
		respond(callbacks);
		callbacks.onSettled?.();
	};

	return {
		inputs,
		mutate,
		succeed: (result?: Partial<CreateOrAttachResult>) =>
			answer((callbacks) =>
				callbacks.onSuccess?.({
					wasRecovered: false,
					isNew: true,
					scrollback: "",
					...result,
				}),
			),
		/** The router's PRECONDITION_FAILED for a shell that exited before ready. */
		failWithShellExited: () =>
			answer((callbacks) => callbacks.onError?.(SHELL_EXITED_ERROR)),
	};
}

function ref<T>(current: T): MutableRefObject<T> {
	return { current };
}

function renderLifecycle(paneId: string) {
	const attach = createAttachStub();
	const container = document.createElement("div");
	document.body.appendChild(container);

	// A mounted pane exists in the store; unmount then parks the terminal
	// instead of tearing the session down.
	useTabsStore.setState((state) => ({
		panes: {
			...state.panes,
			[paneId]: {
				id: paneId,
				tabId: "tab-1",
				type: "terminal",
				name: "terminal",
			},
		},
	}));

	const connectionErrors: Array<string | null> = [];
	const pendingEventsRef = ref<TerminalStreamEvent[]>([]);
	const xterm = createFakeXterm();

	spies.push(
		spyOn(v1TerminalCache, "get").mockReturnValue(undefined),
		spyOn(v1TerminalCache, "getOrCreate").mockReturnValue({
			xterm,
			fitAddon: { fit: () => {} } as unknown as FitAddon,
			searchAddon: {} as SearchAddon,
			gate: createParserIdleGate(),
		} as ReturnType<typeof v1TerminalCache.getOrCreate>),
		spyOn(v1TerminalCache, "attachToContainer").mockImplementation(() => {}),
		spyOn(v1TerminalCache, "detachFromContainer").mockImplementation(() => {}),
		spyOn(v1TerminalCache, "dispose").mockImplementation(() => {}),
		spyOn(v1TerminalCache, "startStream").mockImplementation(() => {}),
		spyOn(v1TerminalCache, "setStreamReady").mockImplementation(() => {}),
	);

	// Stable identities: the mount effect re-runs on any of these changing, and
	// in the app they come from useCallback/refs.
	const options: UseTerminalLifecycleOptions = {
		paneId,
		tabIdRef: ref("tab-1"),
		workspaceId: "workspace-1",
		terminalRef: ref<HTMLDivElement | null>(container),
		xtermRef: ref<XTerm | null>(null),
		fitAddonRef: ref<FitAddon | null>(null),
		searchAddonRef: ref<SearchAddon | null>(null),
		isExitedRef: ref(false),
		wasKilledByUserRef: ref(false),
		commandBufferRef: ref(""),
		isFocusedRef: ref(true),
		isRestoredModeRef: ref(false),
		connectionErrorRef: ref<string | null>(null),
		initialThemeRef: ref(null),
		handleFileLinkClickRef: ref(() => {}),
		handleUrlClickRef: ref<((url: string) => void) | undefined>(undefined),
		paneInitialCwdRef: ref<string | undefined>(undefined),
		clearPaneInitialDataRef: ref(() => {}),
		setConnectionError: (error) => connectionErrors.push(error),
		setExitStatus: () => {},
		setIsRestoredMode: () => {},
		setRestoredCwd: () => {},
		createOrAttachRef: ref(attach.mutate),
		writeRef: ref(() => {}),
		resizeRef: ref(() => {}),
		cancelCreateOrAttachRef: ref(() => {}),
		clearScrollbackRef: ref(() => {}),
		isStreamReadyRef: ref(false),
		didFirstRenderRef: ref(false),
		pendingInitialStateRef: ref<CreateOrAttachResult | null>(null),
		maybeApplyInitialState: () => {},
		flushPendingEvents: () => {},
		pendingEventsRef,
		resetModes: () => {},
		isAlternateScreenRef: ref(false),
		setPaneNameRef: ref(() => {}),
		renameUnnamedWorkspaceRef: ref(() => {}),
		handleTerminalFocusRef: ref(() => {}),
		registerClearCallbackRef: ref(() => {}),
		unregisterClearCallbackRef: ref(() => {}),
		registerScrollToBottomCallbackRef: ref(() => {}),
		unregisterScrollToBottomCallbackRef: ref(() => {}),
		registerGetSelectionCallbackRef: ref(() => {}),
		unregisterGetSelectionCallbackRef: ref(() => {}),
		registerPasteCallbackRef: ref(() => {}),
		unregisterPasteCallbackRef: ref(() => {}),
		defaultRestartCommandRef: ref<string | undefined>(undefined),
	};

	const { result } = renderHook(() => useTerminalLifecycle(options));

	return { attach, connectionErrors, pendingEventsRef, result };
}

describe("useTerminalLifecycle attach", () => {
	it("starts the stream when a restart succeeds after the initial shell exited", async () => {
		const paneId = "pane-shell-exited";
		const { attach, connectionErrors, pendingEventsRef, result } =
			renderLifecycle(paneId);

		act(() => attach.failWithShellExited());

		// The pane shows the exit and waits for a key — no reconnect loop, and
		// no stream, because there is no session to subscribe to yet.
		expect(pendingEventsRef.current).toContainEqual({
			type: "exit",
			exitCode: 1,
			signal: undefined,
		});
		expect(connectionErrors.filter(Boolean)).toEqual([]);
		expect(v1TerminalCache.startStream).not.toHaveBeenCalled();

		// The key press restarts the session: this is the first attach that
		// succeeds, so it owns the stream setup.
		await act(async () => {
			const restarted = result.current.restartTerminal();
			attach.succeed();
			await restarted;
		});

		expect(v1TerminalCache.startStream).toHaveBeenCalledWith(paneId);
		expect(v1TerminalCache.setStreamReady).toHaveBeenCalledWith(paneId);
		await expect(waitForTerminalSessionReady(paneId)).resolves.toBeUndefined();
		expect(attach.inputs).toHaveLength(2);
	});

	it("starts the stream on a successful initial attach", async () => {
		const paneId = "pane-initial-attach";
		const { attach, result } = renderLifecycle(paneId);

		act(() => attach.succeed());

		expect(v1TerminalCache.startStream).toHaveBeenCalledWith(paneId);
		expect(v1TerminalCache.setStreamReady).toHaveBeenCalledWith(paneId);
		await expect(waitForTerminalSessionReady(paneId)).resolves.toBeUndefined();
		expect(result.current.xtermInstance).not.toBeNull();
	});
});

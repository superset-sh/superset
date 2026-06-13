import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import type { CreateOrAttachMutate, CreateOrAttachResult } from "../types";
import type { UseTerminalColdRestoreOptions } from "./useTerminalColdRestore";

const stateSetters = [mock(() => {}), mock(() => {}), mock(() => {})];
let stateIndex = 0;
const stateValues: unknown[] = [];

const startStreamMock = mock(() => {});
const setStreamReadyMock = mock(() => {});
const ackColdRestoreMutateMock = mock(async () => {});
const terminalWriteMutateMock = mock(async () => {});
const writeCommandInPaneMock = mock(async () => {});
const coldRestoreState = new Map<string, unknown>();
const isTerminalAttachCanceledMessageMock = mock(() => false);

mock.module("react", () => ({
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
	useRef: <T>(value: T) => ({ current: value }),
	useState: <T>(initial: T) => {
		const resolvedInitial =
			stateValues[stateIndex] === undefined
				? initial
				: (stateValues[stateIndex] as T);
		const setter = stateSetters[stateIndex] ?? mock(() => {});
		stateIndex += 1;
		return [resolvedInitial, setter] as const;
	},
}));

mock.module("../v1-terminal-cache", () => ({
	startStream: startStreamMock,
	setStreamReady: setStreamReadyMock,
}));

mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		terminal: {
			ackColdRestore: { mutate: ackColdRestoreMutateMock },
			write: { mutate: terminalWriteMutateMock },
		},
	},
}));

mock.module("renderer/lib/terminal/launch-command", () => ({
	writeCommandInPane: writeCommandInPaneMock,
}));

mock.module("../attach-cancel", () => ({
	isTerminalAttachCanceledMessage: isTerminalAttachCanceledMessageMock,
}));

mock.module("../state", () => ({
	coldRestoreState,
}));

mock.module("./terminal-exit-policy", () => ({
	RESTORED_SESSION_CLEAN_EXIT_GRACE_MS: 5_000,
}));

const { useTerminalColdRestore } = await import("./useTerminalColdRestore");

function createXterm() {
	return {
		cols: 120,
		rows: 40,
		clear: mock(() => {}),
		scrollToBottom: mock(() => {}),
		writeln: mock(() => {}),
		write: mock((data: string, callback?: () => void) => {
			void data;
			callback?.();
		}),
		focus: mock(() => {}),
	} as unknown as XTerm;
}

function createOptions(overrides?: {
	createOrAttachImpl?: CreateOrAttachMutate;
}) {
	const xterm = createXterm();
	const pendingInitialStateRef: UseTerminalColdRestoreOptions["pendingInitialStateRef"] =
		{ current: null };
	const pendingEventsRef: UseTerminalColdRestoreOptions["pendingEventsRef"] = {
		current: [],
	};
	return {
		xterm,
		options: {
			paneId: "pane-1",
			tabId: "tab-1",
			workspaceId: "ws-1",
			xtermRef: { current: xterm },
			isStreamReadyRef: { current: false },
			isExitedRef: { current: false },
			wasKilledByUserRef: { current: false },
			isFocusedRef: { current: true },
			didFirstRenderRef: { current: false },
			pendingInitialStateRef,
			pendingEventsRef,
			preserveCleanExitUntilRef: { current: 0 },
			createOrAttachRef: {
				current:
					overrides?.createOrAttachImpl ??
					mock(
						(
							_input: unknown,
							callbacks?: Parameters<CreateOrAttachMutate>[1],
						) => {
							callbacks?.onSuccess?.({
								isNew: false,
								wasRecovered: true,
								scrollback: "",
							} satisfies CreateOrAttachResult);
						},
					),
			},
			setConnectionError: mock(() => {}),
			setExitStatus: mock(() => {}),
			maybeApplyInitialState: mock(() => {}),
			flushPendingEvents: mock(() => {}),
			resetModes: mock(() => {}),
		} satisfies UseTerminalColdRestoreOptions,
	};
}

describe("useTerminalColdRestore", () => {
	beforeEach(() => {
		stateIndex = 0;
		stateValues.length = 0;
		coldRestoreState.clear();
		for (const fn of [
			...stateSetters,
			startStreamMock,
			setStreamReadyMock,
			ackColdRestoreMutateMock,
			terminalWriteMutateMock,
			writeCommandInPaneMock,
			isTerminalAttachCanceledMessageMock,
		]) {
			fn.mockClear();
		}
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			cb(0);
			return 1;
		}) as typeof requestAnimationFrame;
	});

	it("reactivates the cached terminal stream after a successful reconnect", () => {
		const { options } = createOptions();
		const coldRestore = useTerminalColdRestore(options);

		coldRestore.handleRetryConnection();

		expect(startStreamMock).toHaveBeenCalledWith("pane-1");
		expect(setStreamReadyMock).toHaveBeenCalledWith("pane-1");
		expect(options.maybeApplyInitialState).toHaveBeenCalledTimes(1);
		expect(options.preserveCleanExitUntilRef.current).toBeGreaterThan(0);
		expect(options.pendingInitialStateRef.current).toEqual({
			isNew: false,
			wasRecovered: true,
			scrollback: "",
		} satisfies CreateOrAttachResult);
	});

	it("keeps the cached terminal stream inactive while switching into cold-restore mode", () => {
		const { options } = createOptions({
			createOrAttachImpl: (_input, callbacks) => {
				callbacks?.onSuccess?.({
					isNew: false,
					wasRecovered: false,
					scrollback: "restored scrollback",
					isColdRestore: true,
					previousCwd: "/repo",
					resumeCommand: "claude --resume abc123",
				});
			},
		});
		const coldRestore = useTerminalColdRestore(options);

		coldRestore.handleRetryConnection();

		expect(startStreamMock).not.toHaveBeenCalled();
		expect(setStreamReadyMock).not.toHaveBeenCalled();
		expect(options.maybeApplyInitialState).not.toHaveBeenCalled();
		expect(stateSetters[0]).toHaveBeenCalledWith(true);
	});

	it("reactivates the cached terminal stream after starting a restored shell", () => {
		stateValues[2] = "claude --resume abc123";
		const { options } = createOptions();
		const coldRestore = useTerminalColdRestore(options);

		coldRestore.handleStartShell();

		expect(ackColdRestoreMutateMock).toHaveBeenCalledWith({ paneId: "pane-1" });
		expect(startStreamMock).toHaveBeenCalledWith("pane-1");
		expect(setStreamReadyMock).toHaveBeenCalledWith("pane-1");
		expect(options.maybeApplyInitialState).toHaveBeenCalledTimes(1);
		expect(options.resetModes).toHaveBeenCalledTimes(1);
		expect(writeCommandInPaneMock).toHaveBeenCalledTimes(1);
		expect(writeCommandInPaneMock).toHaveBeenCalledWith({
			paneId: "pane-1",
			command: "claude --resume abc123",
			write: expect.any(Function),
		});
	});

	it("clears the clean-exit grace window when starting a restored shell is canceled", () => {
		isTerminalAttachCanceledMessageMock.mockImplementation(
			(message?: string) => message === "attach canceled",
		);
		const { options } = createOptions({
			createOrAttachImpl: (_input, callbacks) => {
				callbacks?.onError?.({ message: "attach canceled" });
			},
		});
		const coldRestore = useTerminalColdRestore(options);

		coldRestore.handleStartShell();

		expect(options.preserveCleanExitUntilRef.current).toBe(0);
		expect(options.setConnectionError).not.toHaveBeenCalled();
		expect(startStreamMock).not.toHaveBeenCalled();
	});
});

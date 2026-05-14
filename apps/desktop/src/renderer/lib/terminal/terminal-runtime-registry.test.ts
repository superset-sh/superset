import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import type { TerminalAppearance } from "./appearance";
import type { TerminalRuntime } from "./terminal-runtime";

type FakeTerminal = TerminalRuntime["terminal"] & {
	emitWriteComplete: () => void;
};

type FakeRuntime = TerminalRuntime & {
	terminal: FakeTerminal;
	wrapper: HTMLDivElement & {
		_canvasList: HTMLCanvasElement[];
		connected: boolean;
	};
};

type MockedTerminalRuntimeModule = typeof import("./terminal-runtime");

const createdRuntimes: FakeRuntime[] = [];
const createRuntimeMock = mock(
	(
		_terminalId: string,
		_appearance: TerminalAppearance,
		_options?: { initialBuffer?: string },
	): TerminalRuntime => {
		const runtime = createFakeRuntime(_terminalId);
		createdRuntimes.push(runtime);
		return runtime;
	},
);
const attachToContainerMock = mock(
	(
		runtime: TerminalRuntime,
		container: HTMLDivElement,
		onResize?: () => void,
	) => {
		runtime.container = container;
		const wrapper = runtime.wrapper as FakeRuntime["wrapper"];
		wrapper.connected = false;
		onResize?.();
	},
);
const detachFromContainerMock = mock((runtime: TerminalRuntime) => {
	runtime.container = null;
	const wrapper = runtime.wrapper as FakeRuntime["wrapper"];
	wrapper.connected = true;
});
const disposeRuntimeMock = mock((runtime: TerminalRuntime) => {
	runtime.container = null;
	const wrapper = runtime.wrapper as FakeRuntime["wrapper"];
	wrapper.connected = false;
});
const updateRuntimeAppearanceMock = mock(
	(_runtime: TerminalRuntime, _appearance: TerminalAppearance) => {},
);
const focusRuntimeMock = mock((_runtime: TerminalRuntime) => {});
const writeRuntimeOutputMock = mock(
	(
		runtime: TerminalRuntime,
		data: string | Uint8Array,
		callback?: () => void,
	) => {
		if ((typeof data === "string" ? data.length : data.byteLength) > 0) {
			runtime.hasBufferedContent = true;
		}
		runtime.terminal.write(data, callback);
	},
);
const shouldReplayTerminalRuntimeMock = mock(
	(runtime: TerminalRuntime) => !runtime.hasBufferedContent,
);

mock.module(
	"./terminal-runtime",
	(): Partial<MockedTerminalRuntimeModule> => ({
		attachToContainer: attachToContainerMock,
		createRuntime: createRuntimeMock,
		detachFromContainer: detachFromContainerMock,
		disposeRuntime: disposeRuntimeMock,
		focusRuntime: focusRuntimeMock,
		shouldReplayTerminalRuntime: shouldReplayTerminalRuntimeMock,
		updateRuntimeAppearance: updateRuntimeAppearanceMock,
		writeRuntimeOutput: writeRuntimeOutputMock,
	}),
);

const { terminalRuntimeRegistry } = await import("./terminal-runtime-registry");

const appearance: TerminalAppearance = {
	background: "#000000",
	fontFamily: "Menlo",
	fontSize: 13,
	theme: {},
};

function createFakeTerminal(): FakeTerminal {
	let writeCallback: (() => void) | undefined;
	return {
		cols: 120,
		rows: 32,
		write: mock((_data: string | Uint8Array, callback?: () => void) => {
			writeCallback = callback;
		}),
		emitWriteComplete: () => writeCallback?.(),
		getSelection: mock(() => ""),
		clear: mock(() => {}),
		scrollToBottom: mock(() => {}),
		paste: mock((_text: string) => {}),
		options: { linkHandler: null },
	} as unknown as FakeTerminal;
}

function createFakeRuntime(terminalId: string): FakeRuntime {
	const wrapper = {
		_canvasList: [] as HTMLCanvasElement[],
		connected: false,
		querySelectorAll: mock((_selector: string) => wrapper._canvasList),
	} as unknown as FakeRuntime["wrapper"];
	Object.defineProperty(wrapper, "isConnected", {
		get: () => wrapper.connected,
	});

	return {
		terminalId,
		terminal: createFakeTerminal(),
		fitAddon: {} as TerminalRuntime["fitAddon"],
		serializeAddon: {
			serialize: mock(() => `serialized:${terminalId}`),
		} as unknown as TerminalRuntime["serializeAddon"],
		searchAddon: null,
		progressAddon: null,
		wrapper,
		container: null,
		resizeObserver: null,
		_disposeResizeObserver: null,
		lastCols: 120,
		lastRows: 32,
		_disposeAddons: null,
		_disposeImagePasteFallback: null,
		_outputQueue: [],
		_outputEnqueued: false,
		_outputQueuedBytes: 0,
		hasBufferedContent: false,
	};
}

function createContainer(): HTMLDivElement {
	return {} as HTMLDivElement;
}

function createCanvas(options: {
	isTerminalWebglCanvas?: boolean;
	context?: WebGL2RenderingContext | null;
}): HTMLCanvasElement & {
	getContext: ReturnType<typeof mock>;
} {
	const attributes = new Map<string, string>();
	if (options.isTerminalWebglCanvas) {
		attributes.set("data-terminal-webgl-canvas", "true");
	}
	const canvas = {
		getAttribute: mock((name: string) => attributes.get(name) ?? null),
		getContext: mock((_contextId: string) => options.context ?? null),
	} as unknown as HTMLCanvasElement & {
		getContext: ReturnType<typeof mock>;
	};

	return canvas;
}

function createWebglContext(extension: unknown): WebGL2RenderingContext {
	return {
		getExtension: mock((_name: string) => extension),
	} as unknown as WebGL2RenderingContext;
}

function clearRegistry() {
	for (const terminalId of terminalRuntimeRegistry.getAllTerminalIds()) {
		terminalRuntimeRegistry.dispose(terminalId);
	}
}

beforeEach(() => {
	clearRegistry();
	for (const fn of [
		createRuntimeMock,
		attachToContainerMock,
		detachFromContainerMock,
		disposeRuntimeMock,
		updateRuntimeAppearanceMock,
		focusRuntimeMock,
		shouldReplayTerminalRuntimeMock,
		writeRuntimeOutputMock,
	]) {
		fn.mockClear();
	}
	createdRuntimes.length = 0;
});

afterEach(() => {
	clearRegistry();
});

afterAll(() => {
	clearRegistry();
	mock.restore();
});

describe("terminalRuntimeRegistry", () => {
	it("reuses the renderer runtime across detach and remount", () => {
		const firstContainer = createContainer();
		const secondContainer = createContainer();

		terminalRuntimeRegistry.mount(
			"terminal-1",
			firstContainer,
			appearance,
			"workspace-a",
		);
		terminalRuntimeRegistry.detach("terminal-1", "workspace-a");
		terminalRuntimeRegistry.mount(
			"terminal-1",
			secondContainer,
			appearance,
			"workspace-a",
		);

		expect(createRuntimeMock).toHaveBeenCalledTimes(1);
		expect(attachToContainerMock).toHaveBeenCalledTimes(2);
		expect(detachFromContainerMock).toHaveBeenCalledTimes(1);
		expect(updateRuntimeAppearanceMock).toHaveBeenCalledTimes(1);
		expect(terminalRuntimeRegistry.getStressDebugInfo("terminal-1")).toEqual([
			expect.objectContaining({
				terminalId: "terminal-1",
				instanceId: "workspace-a",
				hasRuntime: true,
				isAttached: true,
			}),
		]);
	});

	it("releasing one terminal instance leaves sibling instances alive", () => {
		terminalRuntimeRegistry.mount(
			"terminal-1",
			createContainer(),
			appearance,
			"workspace-a",
		);
		terminalRuntimeRegistry.mount(
			"terminal-1",
			createContainer(),
			appearance,
			"workspace-b",
		);

		terminalRuntimeRegistry.release("terminal-1", "workspace-a");

		expect(disposeRuntimeMock).toHaveBeenCalledTimes(1);
		expect(terminalRuntimeRegistry.getStressDebugInfo("terminal-1")).toEqual([
			expect.objectContaining({
				terminalId: "terminal-1",
				instanceId: "workspace-b",
				hasRuntime: true,
			}),
		]);
		expect(terminalRuntimeRegistry.getAllTerminalIds()).toEqual(
			new Set(["terminal-1"]),
		);
	});

	it("does not expand stress queries when only an instance id is provided", () => {
		terminalRuntimeRegistry.mount(
			"terminal-a",
			createContainer(),
			appearance,
			"instance-a",
		);
		terminalRuntimeRegistry.mount(
			"terminal-b",
			createContainer(),
			appearance,
			"instance-b",
		);

		expect(
			terminalRuntimeRegistry.getStressDebugInfo(undefined, "instance-a"),
		).toEqual([]);
		expect(
			terminalRuntimeRegistry.forceWebglContextLossForStress(
				undefined,
				"instance-a",
			),
		).toEqual({
			terminalCount: 0,
			canvasCount: 0,
			webglContextCount: 0,
			lostContextCount: 0,
			unsupportedContextCount: 0,
		});
	});

	it("can force WebGL context loss on terminal canvases during stress runs", () => {
		const loseContext = mock(() => {});
		const canvas = createCanvas({
			isTerminalWebglCanvas: true,
			context: createWebglContext({ loseContext }),
		});

		terminalRuntimeRegistry.mount(
			"terminal-1",
			createContainer(),
			appearance,
			"workspace-a",
		);
		const runtime = createdRuntimes[0];
		if (!runtime) throw new Error("expected runtime");
		runtime.wrapper._canvasList = [canvas];

		const result = terminalRuntimeRegistry.forceWebglContextLossForStress(
			"terminal-1",
			"workspace-a",
		);

		expect(result).toEqual({
			terminalCount: 1,
			canvasCount: 1,
			webglContextCount: 1,
			lostContextCount: 1,
			unsupportedContextCount: 0,
		});
		expect(canvas.getContext).toHaveBeenCalled();
		expect(loseContext).toHaveBeenCalled();
	});

	it("does not create WebGL contexts on unmarked stress canvases", () => {
		const canvas = createCanvas({
			context: createWebglContext({ loseContext: mock(() => {}) }),
		});

		terminalRuntimeRegistry.mount(
			"terminal-1",
			createContainer(),
			appearance,
			"workspace-a",
		);
		const runtime = createdRuntimes[0];
		if (!runtime) throw new Error("expected runtime");
		runtime.wrapper._canvasList = [canvas];

		const result = terminalRuntimeRegistry.forceWebglContextLossForStress(
			"terminal-1",
			"workspace-a",
		);

		expect(result).toEqual({
			terminalCount: 1,
			canvasCount: 1,
			webglContextCount: 0,
			lostContextCount: 0,
			unsupportedContextCount: 0,
		});
		expect(canvas.getContext).not.toHaveBeenCalled();
	});

	it("accepts stress output without waiting for xterm write completion", async () => {
		terminalRuntimeRegistry.mount(
			"terminal-1",
			createContainer(),
			appearance,
			"workspace-a",
		);

		const accepted = await terminalRuntimeRegistry.writeForStress(
			"terminal-1",
			"large output",
			"workspace-a",
		);

		expect(accepted).toBe(true);
		expect(writeRuntimeOutputMock).toHaveBeenCalledWith(
			createdRuntimes[0],
			"large output",
		);
	});
});

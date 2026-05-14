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
	write: ReturnType<typeof mock>;
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
		terminalId: string,
		_appearance: TerminalAppearance,
		_options?: { initialBuffer?: string },
	): TerminalRuntime => {
		const runtime = createFakeRuntime(terminalId);
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

mock.module(
	"./terminal-runtime",
	(): Partial<MockedTerminalRuntimeModule> => ({
		attachToContainer: attachToContainerMock,
		createRuntime: createRuntimeMock,
		detachFromContainer: detachFromContainerMock,
		disposeRuntime: disposeRuntimeMock,
		updateRuntimeAppearance: updateRuntimeAppearanceMock,
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
	return {
		cols: 120,
		rows: 32,
		write: mock((_data: string | Uint8Array) => {}),
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
	};
}

function createContainer(): HTMLDivElement {
	return {} as HTMLDivElement;
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
		expect(createdRuntimes[0]?.terminal.write).toHaveBeenCalledWith(
			"large output",
		);
	});
});

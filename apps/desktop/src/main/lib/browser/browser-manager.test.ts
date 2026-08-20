import { afterEach, describe, expect, mock, test } from "bun:test";

const wcById = new Map<number, FakeWebContents>();

mock.module("electron", () => ({
	clipboard: { writeImage: mock(() => {}), writeText: mock(() => {}) },
	Menu: { buildFromTemplate: mock(() => ({ popup: mock(() => {}) })) },
	webContents: {
		fromId: (id: number) => wcById.get(id) ?? null,
	},
}));

mock.module("main/lib/safe-url", () => ({
	safeOpenExternal: mock(async () => {}),
}));

const { browserManager } = await import("./browser-manager");

interface FakeImage {
	isEmpty: () => boolean;
	toPNG: () => Buffer;
	toJPEG: (quality: number) => Buffer;
}

const PNG_IMAGE: FakeImage = {
	isEmpty: () => false,
	toPNG: () => Buffer.from("png"),
	toJPEG: () => Buffer.from("jpeg"),
};

interface FakeWebContents {
	throttlingCalls: boolean[];
	isDestroyed: () => boolean;
	setBackgroundThrottling: (allowed: boolean) => void;
	setWindowOpenHandler: () => void;
	on: () => void;
	off: () => void;
	getURL: () => string;
	getTitle: () => string;
	isLoading: () => boolean;
	capturePage: ReturnType<typeof mock>;
	debugger: {
		attach: () => void;
		detach: () => void;
		on: () => void;
		off: () => void;
		sendCommand: ReturnType<typeof mock>;
	};
}

let nextId = 1;

function makeWc(): { wc: FakeWebContents; id: number } {
	const throttlingCalls: boolean[] = [];
	const wc: FakeWebContents = {
		throttlingCalls,
		isDestroyed: () => false,
		setBackgroundThrottling: (allowed: boolean) => {
			throttlingCalls.push(allowed);
		},
		setWindowOpenHandler: () => {},
		on: () => {},
		off: () => {},
		getURL: () => "https://example.com",
		getTitle: () => "Example",
		isLoading: () => false,
		capturePage: mock(async () => PNG_IMAGE),
		debugger: {
			attach: () => {},
			detach: () => {},
			on: () => {},
			off: () => {},
			sendCommand: mock(async () => ({})),
		},
	};
	const id = nextId++;
	wcById.set(id, wc);
	return { wc, id };
}

const registered: string[] = [];

function register(paneId: string): FakeWebContents {
	const { wc, id } = makeWc();
	browserManager.register(paneId, id, "ws-1");
	registered.push(paneId);
	return wc;
}

afterEach(() => {
	for (const paneId of registered.splice(0)) {
		browserManager.unregister(paneId);
	}
	wcById.clear();
});

describe("agent wake throttling", () => {
	test("register keeps background throttling enabled by default", () => {
		const wc = register("pane-default");
		expect(wc.throttlingCalls).toEqual([true]);
	});

	test("attachCdp disables throttling for the session and restores on detach", () => {
		const wc = register("pane-cdp");
		const session = browserManager.attachCdp(
			"pane-cdp",
			"ws-1",
			() => {},
			() => {},
		);
		expect(wc.throttlingCalls).toEqual([true, false]);
		session.detach();
		expect(wc.throttlingCalls).toEqual([true, false, true]);
	});

	test("screenshot wakes the pane, retries a failed capture, then re-throttles", async () => {
		const wc = register("pane-shot");
		wc.capturePage
			.mockImplementationOnce(async () => {
				throw new Error("UnknownVizError");
			})
			.mockImplementationOnce(async () => PNG_IMAGE);

		const base64 = await browserManager.capturePng("pane-shot", "ws-1");

		expect(Buffer.from(base64, "base64").toString()).toBe("png");
		expect(wc.capturePage).toHaveBeenCalledTimes(2);
		expect(wc.throttlingCalls).toEqual([true, false, true]);
	});

	test("overlapping wakes are ref-counted: screenshot inside a CDP session does not re-throttle", async () => {
		const wc = register("pane-overlap");
		const session = browserManager.attachCdp(
			"pane-overlap",
			"ws-1",
			() => {},
			() => {},
		);
		await browserManager.capturePng("pane-overlap", "ws-1");
		// Only the CDP attach toggled throttling; the screenshot rode along.
		expect(wc.throttlingCalls).toEqual([true, false]);
		session.detach();
		expect(wc.throttlingCalls).toEqual([true, false, true]);
	});
});

describe("forced CDP detach", () => {
	test("unregister with a live CDP session notifies the client", () => {
		register("pane-force");
		const onDetach = mock((_reason: string) => {});
		browserManager.attachCdp("pane-force", "ws-1", () => {}, onDetach);
		expect(browserManager.getAgentActivePaneIds()).toEqual(["pane-force"]);

		browserManager.unregister("pane-force");

		expect(onDetach).toHaveBeenCalledWith("pane closed");
		expect(browserManager.getAgentActivePaneIds()).toEqual([]);
	});

	test("client-initiated detach does not fire onDetach", () => {
		register("pane-client");
		const onDetach = mock((_reason: string) => {});
		const session = browserManager.attachCdp(
			"pane-client",
			"ws-1",
			() => {},
			onDetach,
		);
		session.detach();
		expect(onDetach).not.toHaveBeenCalled();
	});

	test("Page.captureScreenshot is served via capturePage, not the guest debugger", async () => {
		const wc = register("pane-shim");
		const messages: Array<{ id?: number; result?: { data?: string } }> = [];
		const session = browserManager.attachCdp(
			"pane-shim",
			"ws-1",
			(payload) => messages.push(JSON.parse(payload)),
			() => {},
		);
		const sendCommand = mock(async () => ({}));
		wc.debugger.sendCommand = sendCommand;

		session.send(
			JSON.stringify({ id: 7, method: "Page.captureScreenshot", params: {} }),
		);
		// capturePage resolves asynchronously through the retry loop.
		for (let i = 0; i < 50 && messages.length === 0; i++) {
			await new Promise((r) => setTimeout(r, 10));
		}
		session.detach();

		expect(sendCommand).not.toHaveBeenCalled();
		expect(messages).toHaveLength(1);
		expect(messages[0]?.id).toBe(7);
		expect(
			Buffer.from(messages[0]?.result?.data ?? "", "base64").toString(),
		).toBe("png");
	});

	test("captureScreenshot requests capturePage can't honor keep the native path", async () => {
		const wc = register("pane-shim-passthrough");
		const messages: unknown[] = [];
		const session = browserManager.attachCdp(
			"pane-shim-passthrough",
			"ws-1",
			(payload) => messages.push(JSON.parse(payload)),
			() => {},
		);
		const sendCommand = mock(async () => ({}));
		wc.debugger.sendCommand = sendCommand;

		const passthroughCases = [
			{ clip: { x: 0, y: 0, width: 10, height: 10, scale: 1 } },
			{ captureBeyondViewport: true },
			{ format: "webp" },
			{ fromSurface: false },
			{ optimizeForSpeed: true },
		];
		for (const params of passthroughCases) {
			session.send(
				JSON.stringify({ id: 1, method: "Page.captureScreenshot", params }),
			);
		}
		for (let i = 0; i < 50 && messages.length < passthroughCases.length; i++) {
			await new Promise((r) => setTimeout(r, 10));
		}
		session.detach();

		expect(sendCommand).toHaveBeenCalledTimes(passthroughCases.length);
		expect(wc.capturePage).not.toHaveBeenCalled();
	});

	test("a stale capture release cannot drop a wake acquired after re-registration", async () => {
		const wc1 = register("pane-stale");
		let resolveCapture!: (image: FakeImage) => void;
		wc1.capturePage.mockImplementationOnce(
			() => new Promise<FakeImage>((r) => (resolveCapture = r)),
		);
		const capture = browserManager.capturePng("pane-stale", "ws-1");

		// The pane dies and comes back while the capture is still in flight,
		// and a new CDP session acquires a fresh wake on the reincarnation.
		browserManager.unregister("pane-stale");
		const wc2 = register("pane-stale");
		const session = browserManager.attachCdp(
			"pane-stale",
			"ws-1",
			() => {},
			() => {},
		);

		resolveCapture(PNG_IMAGE);
		await capture;

		// The stale release must not clear the new session's wake.
		expect(browserManager.getAgentActivePaneIds()).toEqual(["pane-stale"]);
		expect(wc2.throttlingCalls[wc2.throttlingCalls.length - 1]).toBe(false);
		session.detach();
	});

	test("a live session forwards commands to the guest debugger", async () => {
		const wc = register("pane-live");
		const messages: Array<{ id?: number; result?: unknown }> = [];
		const session = browserManager.attachCdp(
			"pane-live",
			"ws-1",
			(payload) => messages.push(JSON.parse(payload)),
			() => {},
		);
		const sendCommand = mock(async () => ({ value: 1 }));
		wc.debugger.sendCommand = sendCommand;

		session.send(
			JSON.stringify({
				id: 3,
				method: "Runtime.evaluate",
				params: { expression: "1" },
			}),
		);
		for (let i = 0; i < 50 && messages.length === 0; i++) {
			await new Promise((r) => setTimeout(r, 10));
		}
		session.detach();

		expect(sendCommand).toHaveBeenCalledWith(
			"Runtime.evaluate",
			{ expression: "1" },
			undefined,
		);
		expect(messages).toEqual([{ id: 3, result: { value: 1 } }]);
	});

	test("a send after the guest is destroyed detaches instead of throwing", () => {
		const wc = register("pane-destroyed");
		const onDetach = mock((_reason: string) => {});
		const session = browserManager.attachCdp(
			"pane-destroyed",
			"ws-1",
			() => {},
			onDetach,
		);
		// Guest teardown mid-session: every wc.debugger touch now throws the way
		// Electron's destroyed-WebContents binding does.
		wc.isDestroyed = () => true;
		const destroyedThrow = () => {
			throw new TypeError("Object has been destroyed");
		};
		wc.debugger.off = destroyedThrow;
		wc.debugger.detach = destroyedThrow;
		wc.debugger.sendCommand = mock(destroyedThrow);

		expect(() =>
			session.send(JSON.stringify({ id: 1, method: "Runtime.enable" })),
		).not.toThrow();
		expect(onDetach).toHaveBeenCalledWith("pane closed");
		expect(wc.debugger.sendCommand).not.toHaveBeenCalled();
		expect(browserManager.getAgentActivePaneIds()).toEqual([]);

		// The session is closed now — a second late message is a no-op.
		expect(() =>
			session.send(JSON.stringify({ id: 2, method: "Runtime.enable" })),
		).not.toThrow();
		expect(onDetach).toHaveBeenCalledTimes(1);
	});

	test("forced detach after the guest is destroyed does not throw", () => {
		const wc = register("pane-destroyed-force");
		const onDetach = mock((_reason: string) => {});
		browserManager.attachCdp(
			"pane-destroyed-force",
			"ws-1",
			() => {},
			onDetach,
		);
		wc.isDestroyed = () => true;
		const destroyedThrow = () => {
			throw new TypeError("Object has been destroyed");
		};
		wc.debugger.off = destroyedThrow;
		wc.debugger.detach = destroyedThrow;

		expect(() =>
			browserManager.unregister("pane-destroyed-force"),
		).not.toThrow();
		expect(onDetach).toHaveBeenCalledWith("pane closed");
	});

	test("agent-active events track attach and detach", () => {
		register("pane-state");
		const states: string[][] = [];
		const handler = (state: { paneIds: string[] }) => {
			states.push(state.paneIds);
		};
		browserManager.on("agent-active", handler);
		const session = browserManager.attachCdp(
			"pane-state",
			"ws-1",
			() => {},
			() => {},
		);
		session.detach();
		browserManager.off("agent-active", handler);
		expect(states).toEqual([["pane-state"], []]);
	});
});

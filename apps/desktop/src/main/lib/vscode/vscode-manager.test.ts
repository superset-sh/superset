import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { VscodeManager, type VscodeManagerDeps } from "./vscode-manager";

class FakeServer extends EventEmitter {
	started = false;
	stopped = false;
	constructor(public readonly port: number) {
		super();
	}
	async start() {
		this.started = true;
		queueMicrotask(() =>
			this.emit("ready", { url: `http://127.0.0.1:${this.port}/` }),
		);
	}
	stop() {
		this.stopped = true;
	}
}

interface FakeNativeImage {
	isEmpty: () => boolean;
	toDataURL: () => string;
}

interface FakeView {
	webContents: {
		loadURL: ReturnType<typeof mock>;
		close: ReturnType<typeof mock>;
		focus: ReturnType<typeof mock>;
		on: ReturnType<typeof mock>;
		setWindowOpenHandler: ReturnType<typeof mock>;
		capturePage: ReturnType<typeof mock>;
		_listeners: Map<string, ((...args: unknown[]) => void)[]>;
	};
	setBounds: ReturnType<typeof mock>;
	setVisible: ReturnType<typeof mock>;
	destroyed: boolean;
}

function makeFakeView(
	captureResult: FakeNativeImage | Error = {
		isEmpty: () => false,
		toDataURL: () => "data:image/png;base64,FAKE",
	},
): FakeView {
	const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
	return {
		webContents: {
			loadURL: mock(() => {}),
			close: mock(() => {}),
			focus: mock(() => {}),
			on: mock((event: string, handler: (...args: unknown[]) => void) => {
				if (!listeners.has(event)) listeners.set(event, []);
				listeners.get(event)!.push(handler);
			}),
			setWindowOpenHandler: mock(() => {}),
			capturePage: mock(async () => {
				if (captureResult instanceof Error) throw captureResult;
				return captureResult;
			}),
			_listeners: listeners,
		},
		setBounds: mock(() => {}),
		setVisible: mock(() => {}),
		destroyed: false,
	};
}

function makeManager(overrides: Partial<VscodeManagerDeps> = {}) {
	const window = {
		contentView: {
			addChildView: mock(() => {}),
			removeChildView: mock(() => {}),
		},
		isDestroyed: () => false,
	};
	const views: FakeView[] = [];
	const servers: FakeServer[] = [];
	const deps: VscodeManagerDeps = {
		getWindow: () => window as never,
		findFreePort: async () => 40000,
		// Tests leave preferredPort unset so the manager skips real TCP probing.
		isCodeCliAvailable: async () => true,
		createServer: (port) => {
			const s = new FakeServer(port);
			servers.push(s);
			return s as never;
		},
		createView: () => {
			const v = makeFakeView();
			views.push(v);
			return v as never;
		},
		...overrides,
	};
	return { manager: new VscodeManager(deps), window, deps, views, servers };
}

describe("VscodeManager", () => {
	it("start() spawns the shared server and attaches a hidden view", async () => {
		const { manager, window, servers } = makeManager();
		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("ready");
		expect(window.contentView.addChildView).toHaveBeenCalledTimes(1);
		expect(servers.length).toBe(1);
	});

	it("start() is idempotent for the same paneId", async () => {
		const { manager, window } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		expect(window.contentView.addChildView).toHaveBeenCalledTimes(1);
	});

	it("reuses a single server across panes and loads per-pane ?folder= URLs", async () => {
		const { manager, window, servers, views } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/one" });
		await manager.start({ paneId: "p2", worktreePath: "/tmp/two" });
		expect(servers.length).toBe(1);
		expect(window.contentView.addChildView).toHaveBeenCalledTimes(2);
		const urls = views.map(
			(v) => v.webContents.loadURL.mock.calls.at(0)?.[0] as string,
		);
		expect(urls[0]).toContain("folder=%2Ftmp%2Fone");
		expect(urls[1]).toContain("folder=%2Ftmp%2Ftwo");
		// Shared origin is the same across panes — this is what makes
		// IndexedDB / localStorage settings persist across panes.
		const origin = (u: string) => new URL(u).origin;
		expect(origin(urls[0])).toBe(origin(urls[1]));
	});

	it("stop() removes the view and keeps the server alive while other panes remain", async () => {
		const { manager, window, servers } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/one" });
		await manager.start({ paneId: "p2", worktreePath: "/tmp/two" });
		manager.stop("p1");
		expect(window.contentView.removeChildView).toHaveBeenCalledTimes(1);
		expect(servers[0]?.stopped).toBe(false);
	});

	it("stop() on the last pane also stops the shared server", async () => {
		const { manager, servers } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		manager.stop("p1");
		expect(servers[0]?.stopped).toBe(true);
	});

	it("stopAll() removes all views and stops the shared server", async () => {
		const { manager, window, servers } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/one" });
		await manager.start({ paneId: "p2", worktreePath: "/tmp/two" });
		manager.stopAll();
		expect(window.contentView.removeChildView).toHaveBeenCalledTimes(2);
		expect(servers[0]?.stopped).toBe(true);
	});

	it("start() resolves with status 'cli-missing' when the binary is absent", async () => {
		const { manager } = makeManager({ isCodeCliAvailable: async () => false });
		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("cli-missing");
	});

	it("focus() forwards to the embedded webContents for a ready pane", async () => {
		const { manager, views } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		manager.focus("p1");
		expect(views[0]?.webContents.focus).toHaveBeenCalledTimes(1);
	});

	it("focus() is a no-op for unknown panes", () => {
		const { manager, views } = makeManager();
		manager.focus("unknown");
		expect(views.length).toBe(0);
	});

	it("capture() returns a data URL from the embedded webContents", async () => {
		const { manager } = makeManager();
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		const dataUrl = await manager.capture("p1");
		expect(dataUrl).toBe("data:image/png;base64,FAKE");
	});

	it("capture() returns null when the captured frame is empty", async () => {
		const { manager } = makeManager({
			createView: () => {
				const v = makeFakeView({
					isEmpty: () => true,
					toDataURL: () => "data:image/png;base64,EMPTY",
				});
				return v as never;
			},
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		const dataUrl = await manager.capture("p1");
		expect(dataUrl).toBeNull();
	});

	it("capture() returns null when capturePage throws", async () => {
		const { manager } = makeManager({
			createView: () => {
				const v = makeFakeView(new Error("destroyed"));
				return v as never;
			},
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		const dataUrl = await manager.capture("p1");
		expect(dataUrl).toBeNull();
	});

	it("capture() returns null for unknown panes", async () => {
		const { manager } = makeManager();
		const dataUrl = await manager.capture("unknown");
		expect(dataUrl).toBeNull();
	});

	it("returns failed when loadURL rejects", async () => {
		// Electron's webContents.loadURL returns a Promise that rejects on
		// did-fail-load. Without awaiting, we'd emit 'ready' for a dead view
		// and leak an unhandled rejection.
		const { manager } = makeManager({
			createView: () => {
				const v = makeFakeView();
				v.webContents.loadURL = mock(async () => {
					throw new Error("ERR_CONNECTION_REFUSED");
				});
				return v as never;
			},
		});
		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("failed");
		expect(result.error).toBe("ERR_CONNECTION_REFUSED");
		expect(manager.has("p1")).toBe(false);
	});

	it("converts ensureShared exceptions into a failed result", async () => {
		// isCodeCliAvailable, port probing, and env resolution can reject.
		// start() should surface those as VscodeStartResult, not propagate
		// the rejection to the caller.
		const { manager } = makeManager({
			isCodeCliAvailable: async () => {
				throw new Error("cli check crashed");
			},
		});
		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("failed");
		expect(result.error).toBe("cli check crashed");
	});

	it("start() after shared exit restarts instead of returning stale ready", async () => {
		// If the shared server dies while a pane entry is still cached, a
		// follow-up start() for the same paneId must spin up a fresh server
		// rather than return `ready` with `port: undefined`.
		let serverIndex = 0;
		const servers: FakeServer[] = [];
		const { manager, window } = makeManager({
			createServer: (port) => {
				const s = new FakeServer(port);
				servers.push(s);
				serverIndex++;
				return s as never;
			},
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		// Simulate the shared server exiting mid-session.
		servers[0]?.emit("exit", {
			code: 1,
			signal: null,
			outputTail: "boom",
		});
		await new Promise((r) => setTimeout(r, 0));

		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("ready");
		expect(serverIndex).toBe(2);
		// Stale view got cleaned up; new one attached.
		expect(window.contentView.addChildView).toHaveBeenCalledTimes(2);
		expect(window.contentView.removeChildView).toHaveBeenCalledTimes(1);
	});

	it("stop() during in-flight start bails out without attaching a view", async () => {
		// stop() bumps a generation counter that doStart() re-checks after
		// each await. If the pane was closed mid-boot, we must not attach a
		// WebContentsView for a tab that no longer exists.
		const controls: { releaseReady?: () => void } = {};
		class SlowServer extends EventEmitter {
			constructor(public readonly port: number) {
				super();
			}
			async start() {
				controls.releaseReady = () => {
					this.emit("ready", { url: `http://127.0.0.1:${this.port}/` });
				};
			}
			stop() {}
		}
		const { manager, window } = makeManager({
			createServer: (port) => new SlowServer(port) as never,
		});
		const startPromise = manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		// Let doStart() reach `await shared.readyUrl` before we stop.
		await new Promise((r) => setTimeout(r, 0));
		manager.stop("p1");
		const releaseReady = controls.releaseReady;
		if (!releaseReady) throw new Error("SlowServer did not start");
		releaseReady();
		const result = await startPromise;
		expect(result.status).toBe("failed");
		expect(result.error).toBe("cancelled");
		// stop() ran cleanupView on the entry attached before readyUrl
		// resolved; cancellation prevents any further addChildView.
		expect(manager.has("p1")).toBe(false);
		// addChildView fires once before the await, then stop() fires
		// removeChildView. No extra attach after cancellation.
		expect(window.contentView.addChildView).toHaveBeenCalledTimes(1);
	});

	it("registers will-navigate handler that blocks non-localhost origins", async () => {
		const views: FakeView[] = [];
		const { manager } = makeManager({
			createView: () => {
				const v = makeFakeView();
				views.push(v);
				return v as never;
			},
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		const view = views[0]!;
		const navigateHandlers = view.webContents._listeners.get("will-navigate");
		expect(navigateHandlers).toBeDefined();
		expect(navigateHandlers!.length).toBeGreaterThan(0);

		const prevented: boolean[] = [];
		const fakeEvent = {
			preventDefault: () => prevented.push(true),
		};

		navigateHandlers![0]!(fakeEvent, "http://evil.com/steal");
		expect(prevented.length).toBe(1);

		navigateHandlers![0]!(fakeEvent, "http://127.0.0.1:40000/some-path");
		expect(prevented.length).toBe(1);
	});

	it("registers setWindowOpenHandler that denies all new windows", async () => {
		const views: FakeView[] = [];
		const { manager } = makeManager({
			createView: () => {
				const v = makeFakeView();
				views.push(v);
				return v as never;
			},
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		const view = views[0]!;
		expect(view.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
	});

	it("retries doStart when the captured shared server dies mid-start", async () => {
		// First server exits before emitting 'ready'; the second spins up
		// cleanly. A pane that captured the stale reference must still land
		// in 'ready' rather than surface the stale exit error.
		class DyingServer extends EventEmitter {
			started = false;
			stopped = false;
			constructor(public readonly port: number) {
				super();
			}
			async start() {
				this.started = true;
				queueMicrotask(() => {
					this.emit("exit", {
						code: 1,
						signal: null,
						outputTail: "boom",
					});
				});
			}
			stop() {
				this.stopped = true;
			}
		}
		let index = 0;
		const { manager } = makeManager({
			createServer: (port) => {
				const s = index === 0 ? new DyingServer(port) : new FakeServer(port);
				index++;
				return s as never;
			},
		});
		const result = await manager.start({
			paneId: "p1",
			worktreePath: "/tmp/repo",
		});
		expect(result.status).toBe("ready");
		expect(index).toBe(2);
	});
});

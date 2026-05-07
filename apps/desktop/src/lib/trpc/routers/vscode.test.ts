import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { z } from "zod";

const BoundsInput = z.object({
	paneId: z.string().min(1),
	x: z.number(),
	y: z.number(),
	width: z.number().min(0),
	height: z.number().min(0),
});

const StartInput = z.object({
	paneId: z.string().min(1),
	worktreePath: z.string().min(1),
});

const PaneIdInput = z.object({
	paneId: z.string().min(1),
});

describe("vscode router input validation", () => {
	describe("BoundsInput", () => {
		it("accepts valid bounds", () => {
			const result = BoundsInput.safeParse({
				paneId: "p1",
				x: 10,
				y: 20,
				width: 800,
				height: 600,
			});
			expect(result.success).toBe(true);
		});

		it("rejects empty paneId", () => {
			const result = BoundsInput.safeParse({
				paneId: "",
				x: 0,
				y: 0,
				width: 100,
				height: 100,
			});
			expect(result.success).toBe(false);
		});

		it("rejects negative width", () => {
			const result = BoundsInput.safeParse({
				paneId: "p1",
				x: 0,
				y: 0,
				width: -1,
				height: 100,
			});
			expect(result.success).toBe(false);
		});

		it("rejects negative height", () => {
			const result = BoundsInput.safeParse({
				paneId: "p1",
				x: 0,
				y: 0,
				width: 100,
				height: -5,
			});
			expect(result.success).toBe(false);
		});

		it("accepts zero dimensions", () => {
			const result = BoundsInput.safeParse({
				paneId: "p1",
				x: 0,
				y: 0,
				width: 0,
				height: 0,
			});
			expect(result.success).toBe(true);
		});

		it("accepts negative x/y (off-screen positioning)", () => {
			const result = BoundsInput.safeParse({
				paneId: "p1",
				x: -100,
				y: -50,
				width: 800,
				height: 600,
			});
			expect(result.success).toBe(true);
		});
	});

	describe("StartInput", () => {
		it("accepts valid start input", () => {
			const result = StartInput.safeParse({
				paneId: "p1",
				worktreePath: "/tmp/repo",
			});
			expect(result.success).toBe(true);
		});

		it("rejects empty worktreePath", () => {
			const result = StartInput.safeParse({
				paneId: "p1",
				worktreePath: "",
			});
			expect(result.success).toBe(false);
		});

		it("rejects empty paneId", () => {
			const result = StartInput.safeParse({
				paneId: "",
				worktreePath: "/tmp/repo",
			});
			expect(result.success).toBe(false);
		});
	});

	describe("PaneIdInput", () => {
		it("accepts valid paneId", () => {
			const result = PaneIdInput.safeParse({ paneId: "p1" });
			expect(result.success).toBe(true);
		});

		it("rejects empty paneId", () => {
			const result = PaneIdInput.safeParse({ paneId: "" });
			expect(result.success).toBe(false);
		});
	});
});

describe("vscode manager setBounds/setVisible contract", () => {
	class FakeServer extends EventEmitter {
		async start() {
			queueMicrotask(() =>
				this.emit("ready", { url: "http://127.0.0.1:40000/" }),
			);
		}
		stop() {}
	}

	function makeFakeView() {
		return {
			webContents: {
				loadURL: mock(() => {}),
				close: mock(() => {}),
				focus: mock(() => {}),
				on: mock(() => {}),
				setWindowOpenHandler: mock(() => {}),
				capturePage: mock(async () => ({
					isEmpty: () => false,
					toDataURL: () => "data:image/png;base64,FAKE",
				})),
			},
			setBounds: mock(() => {}),
			setVisible: mock(() => {}),
			destroyed: false,
		};
	}

	async function makeReadyManager() {
		const { VscodeManager } = await import(
			"../../../main/lib/vscode/vscode-manager"
		);
		const view = makeFakeView();
		const manager = new VscodeManager({
			getWindow: () =>
				({
					contentView: {
						addChildView: mock(() => {}),
						removeChildView: mock(() => {}),
					},
					isDestroyed: () => false,
				}) as never,
			findFreePort: async () => 40000,
			isCodeCliAvailable: async () => true,
			createServer: () => new FakeServer() as never,
			createView: () => view as never,
		});
		await manager.start({ paneId: "p1", worktreePath: "/tmp/repo" });
		return { manager, view };
	}

	it("setBounds rounds and clamps values", async () => {
		const { manager, view } = await makeReadyManager();
		manager.setBounds("p1", { x: 10.7, y: 20.3, width: 800.9, height: -5 });
		expect(view.setBounds).toHaveBeenCalledWith({
			x: 11,
			y: 20,
			width: 801,
			height: 0,
		});
	});

	it("setBounds is a no-op for unknown panes", async () => {
		const { manager, view } = await makeReadyManager();
		view.setBounds.mockClear();
		manager.setBounds("unknown", { x: 0, y: 0, width: 100, height: 100 });
		expect(view.setBounds).not.toHaveBeenCalled();
	});

	it("setVisible forwards to the view", async () => {
		const { manager, view } = await makeReadyManager();
		view.setVisible.mockClear();
		manager.setVisible("p1", true);
		expect(view.setVisible).toHaveBeenCalledWith(true);
		manager.setVisible("p1", false);
		expect(view.setVisible).toHaveBeenCalledWith(false);
	});

	it("setVisible is a no-op for unknown panes", async () => {
		const { manager, view } = await makeReadyManager();
		view.setVisible.mockClear();
		manager.setVisible("unknown", true);
		expect(view.setVisible).not.toHaveBeenCalled();
	});
});

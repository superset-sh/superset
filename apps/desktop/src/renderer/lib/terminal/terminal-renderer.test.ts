import { describe, expect, it, mock } from "bun:test";
import { refreshTerminalRenderer } from "./terminal-renderer";

describe("refreshTerminalRenderer", () => {
	it("clears the WebGL texture atlas before forcing a repaint", () => {
		const terminal = {
			rows: 4,
			refresh: mock(() => {}),
		};
		const webglAddon = {
			clearTextureAtlas: mock(() => {}),
		};

		refreshTerminalRenderer(terminal, webglAddon);

		expect(webglAddon.clearTextureAtlas).toHaveBeenCalledTimes(1);
		expect(terminal.refresh).toHaveBeenCalledWith(0, 3);
	});

	it("still refreshes when clearing the atlas throws", () => {
		const terminal = {
			rows: 1,
			refresh: mock(() => {}),
		};
		const webglAddon = {
			clearTextureAtlas: mock(() => {
				throw new Error("atlas reset failed");
			}),
		};

		refreshTerminalRenderer(terminal, webglAddon);

		expect(webglAddon.clearTextureAtlas).toHaveBeenCalledTimes(1);
		expect(terminal.refresh).toHaveBeenCalledWith(0, 0);
	});
});

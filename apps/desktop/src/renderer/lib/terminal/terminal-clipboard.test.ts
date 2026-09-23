import { afterEach, describe, expect, it, mock } from "bun:test";
import { writeTerminalClipboard } from "./terminal-clipboard";

const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
afterEach(() => {
	if (previous) Object.defineProperty(globalThis, "navigator", previous);
	else Reflect.deleteProperty(globalThis, "navigator");
});

function clipboard(writeText?: (text: string) => Promise<void>) {
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: { clipboard: writeText ? { writeText } : undefined },
	});
}

describe("writeTerminalClipboard", () => {
	it("does not invoke native copying after browser success", async () => {
		const write = mock(async () => {});
		const native = mock(async () => {});
		clipboard(write);
		await writeTerminalClipboard("a\r\nb\u3000", native);
		expect(write).toHaveBeenCalledWith("a\r\nb\u3000");
		expect(native).not.toHaveBeenCalled();
	});
	it("falls back when the browser rejects", async () => {
		clipboard(async () => {
			throw new Error("NotAllowedError");
		});
		const native = mock(async () => {});
		await writeTerminalClipboard("selected", native);
		expect(native).toHaveBeenCalledWith("selected");
	});
	it("falls back when the browser API is absent", async () => {
		clipboard();
		const native = mock(async () => {});
		await writeTerminalClipboard("selected", native);
		expect(native).toHaveBeenCalledWith("selected");
	});
	it("falls back on synchronous browser failure", async () => {
		clipboard(() => {
			throw new Error("denied");
		});
		const native = mock(async () => {});
		await writeTerminalClipboard("selected", native);
		expect(native).toHaveBeenCalledWith("selected");
	});
	it("propagates native failure so callers cannot report success", async () => {
		clipboard();
		await expect(
			writeTerminalClipboard("selected", async () => {
				throw new Error("native failed");
			}),
		).rejects.toThrow("native failed");
	});
});
